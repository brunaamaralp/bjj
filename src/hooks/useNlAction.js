import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useSalesStore } from '../store/useSalesStore';
import { useInventoryStore } from '../store/useInventoryStore';
import { formatAdjustToast } from '../lib/inventoryAdjust';
import { account, createSessionJwt } from '../lib/appwrite';
import { createPayment, updatePayment } from '../lib/studentPayments';
import { useSalesCatalog } from './useSalesCatalog';
import { catalogProductsForNl } from '../../lib/nlStockMatch.js';
import {
  canonicalPaymentMethodKeyFromInput,
  normalizePaymentMethodInput,
  toStorageDialectMethod,
  isKnownStorageDialectMethod,
} from '../lib/paymentMethods.js';
import { createExpenseTransaction } from '../lib/financeExpense';
import { createCheckin, isAttendanceConfigured } from '../lib/attendance.js';
import { freezeStudentApi } from '../lib/studentsApi.js';
import { normalizeScheduleTime, isValidYmd } from '../../lib/nlScheduleParse.js';
import { sanitizeStudentUpdatesForNl } from '../../lib/studentNlUpdates.js';
import { sanitizePaymentUpdatesForNl } from '../../lib/paymentNlUpdates.js';
import { normalizeLeadProfileType } from '../../lib/leadTypeNormalize.js';
import { isPaymentMethodActive } from '../lib/paymentMethodSettings.js';
import { toastAdapterFromAddToast } from '../lib/financeTxSettlementDisplay.js';
import { applySettleAccountingSideEffects } from '../lib/financeTxSettle.js';
import { addLeadEvent } from '../lib/leadEvents';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import { useTerms } from '../lib/terminology.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { getStageUpdatePayload } from '../lib/leadStageRules.js';
import { emitLeadAttendanceChanged, emitLeadsRefresh } from '../lib/leadTimelineEvents.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { sendWhatsappTemplateOutbound } from '../lib/outboundWhatsappTemplate.js';
import { parseAutomationsConfig } from '../lib/useAutomations.js';
import {
  afterExperimentalScheduled,
  afterPresenceConfirmed,
  afterMissed,
  afterMovedToPipelineStage,
} from '../lib/automationDispatch.js';
import { notifyAutomationFeedback, safeAutomationDispatch } from '../lib/automationUx.js';

/** Etapas que exigem fluxo próprio (matrícula, perda, não compareceu, agenda experimental). */
const MOVE_PIPELINE_FORBIDDEN_TARGETS = new Set([
  'Matriculado',
  LEAD_STATUS.MISSED,
  LEAD_STATUS.LOST,
  'Aula experimental'
]);

const CREATE_LEAD_TYPES = new Set(['Adulto', 'Criança', 'Juniores']);

function normalizePaymentMethod(m) {
  if (!String(m || '').trim()) return 'pix';
  const key = canonicalPaymentMethodKeyFromInput(m);
  if (!key) return 'pix';
  const dialect = toStorageDialectMethod(key);
  return isKnownStorageDialectMethod(dialect) ? dialect : 'pix';
}

function mapNlPaymentFormToSale(form) {
  const raw = normalizePaymentMethodInput(form);
  if (!raw) return 'pix';
  const nlSaleMap = {
    link_pagbank: 'outro',
    pagbank: 'outro',
    outro: 'outro',
  };
  if (nlSaleMap[raw]) return nlSaleMap[raw];
  return canonicalPaymentMethodKeyFromInput(form) || 'pix';
}

export function useNlAction() {
  const terms = useTerms();
  const leads = useLeadStore((s) => s.leads);
  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const storeTeamId = useLeadStore((s) => s.teamId);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const updateLead = useLeadStore((s) => s.updateLead);
  const addLead = useLeadStore((s) => s.addLead);
  const addToast = useUiStore((s) => s.addToast);
  const createSale = useSalesStore((s) => s.createSale);
  const { products: stockProducts } = useSalesCatalog(academyId);
  const {
    templates: waTemplates,
    academyName: waAcademyName,
    zapsterInstanceId: waZapId,
    automationsRaw,
  } = useWhatsappTemplates(academyId);
  const automationConfig = useMemo(
    () => parseAutomationsConfig(automationsRaw),
    [automationsRaw]
  );
  const waOutbound = useMemo(
    () => ({
      name: waAcademyName || '',
      zapster_instance_id: waZapId || '',
      templates: waTemplates || DEFAULT_WHATSAPP_TEMPLATES,
    }),
    [waAcademyName, waZapId, waTemplates]
  );

  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  const permissionContext = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId) || {};
    return {
      teamId: String(cur.teamId || storeTeamId || '').trim(),
      userId: String(userId || '').trim()
    };
  }, [academyList, academyId, userId, storeTeamId]);

  const [sessionUserName, setSessionUserName] = useState('');

  useEffect(() => {
    let c = false;
    account
      .get()
      .then((u) => {
        if (c) return;
        setSessionUserName(String(u.name || u.email || '').trim() || 'Usuário');
      })
      .catch(() => {
        if (!c) setSessionUserName('Usuário');
      });
    return () => {
      c = true;
    };
  }, []);

  const interpret = useCallback(
    async (text, context = 'financeiro', opts = {}) => {
      const students = leads
        .filter((l) => l.status === LEAD_STATUS.CONVERTED || l.contact_type === 'student')
        .map((l) => ({ id: l.id, name: l.name, plan: l.plan || '' }));
      const funnelLeads = leads
        .filter((l) => l.contact_type !== 'student' && l.status !== LEAD_STATUS.CONVERTED && l.status !== LEAD_STATUS.LOST)
        .map((l) => ({
          id: l.id,
          name: l.name,
          status: l.status,
          pipelineStage: l.pipelineStage || ''
        }));

      const pipelineStagesPayload = (Array.isArray(opts.pipelineStages) ? opts.pipelineStages : [])
        .filter((s) => s && String(s.id || '').trim())
        .slice(0, 48)
        .map((s) => ({ id: String(s.id).trim(), label: String(s.label || s.id || '').trim() }));

      const pendingTransactionsPayload = (Array.isArray(opts.pendingTransactions) ? opts.pendingTransactions : [])
        .filter((t) => t && String(t.id || '').trim())
        .slice(0, 40)
        .map((t) => ({
          id: String(t.id).trim(),
          status: String(t.status || '').toLowerCase(),
          gross: Number(t.gross),
          fee: Number(t.fee),
          net: Number(t.net),
          method: String(t.method || ''),
          installments: Number(t.installments) || 1,
          type: String(t.type || ''),
          planName: String(t.planName || ''),
          lead_id: String(t.lead_id || ''),
          note: String(t.note || ''),
          createdAt: String(t.createdAt || '')
        }));

      const recentPaymentsPayload = (Array.isArray(opts.recentPayments) ? opts.recentPayments : [])
        .filter((p) => p && String(p.id || p.$id || '').trim())
        .slice(0, 120)
        .map((p) => ({
          id: String(p.id || p.$id || '').trim(),
          student_id: String(p.student_id || p.lead_id || '').trim(),
          lead_id: String(p.lead_id || p.student_id || '').trim(),
          student_name: String(p.student_name || '').trim(),
          reference_month: String(p.reference_month || '').trim(),
          amount: Number(p.amount),
          status: String(p.status || '').toLowerCase(),
          method: String(p.method || ''),
          note: String(p.note || ''),
          plan_name: String(p.plan_name || '').trim(),
          account: String(p.account || '').trim()
        }));

      const stockProductsPayload = catalogProductsForNl(
        Array.isArray(opts.stockProducts) && opts.stockProducts.length
          ? opts.stockProducts
          : stockProducts
      );

      const financePlansPayload = (financeConfig?.plans || []).map((p) => ({
        name: String(p?.name || '').trim(),
        price: Number(p?.price),
      }));

      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

      const res = await fetch('/api/agent?route=nl-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyId || '').trim()
        },
        body: JSON.stringify({
          text,
          students,
          leads: funnelLeads,
          academyName,
          context,
          pipelineStages: pipelineStagesPayload,
          pendingTransactions: pendingTransactionsPayload,
          recentPayments: recentPaymentsPayload,
          stockProducts: stockProductsPayload,
          financePlans: financePlansPayload
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.erro || `Erro HTTP ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : 'Erro na requisição');
      }
      return data;
    },
    [leads, academyId, academyName, stockProducts, financeConfig]
  );

  const execute = useCallback(
    async (parsed) => {
      if (!parsed || typeof parsed !== 'object') throw new Error('Resposta inválida');
      const notifyLeadsRefresh = () => emitLeadsRefresh({ reason: String(parsed?.action || '').trim() });

      if (parsed.action === 'register_payment') {
        const d = parsed.data || {};
        const leadId = String(d.student_id || '').trim();
        if (!leadId) throw new Error('Aluno não identificado');
        const ym = String(d.reference_month || '').trim();
        if (!ym) throw new Error('Mês de referência ausente');
        const student = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        let amountNum = d.amount != null && d.amount !== '' ? Number(d.amount) : 0;
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          const expected = Number(d.expected_amount);
          if (Number.isFinite(expected) && expected > 0) amountNum = expected;
        }
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          throw new Error('Informe o valor do pagamento ou cadastre o preço do plano.');
        }
        const method = normalizePaymentMethod(d.method);
        if (method && !isPaymentMethodActive(financeConfig, method)) {
          throw new Error(
            'Esta forma de pagamento está desativada. Ative em Financeiro → Configurações → Formas de recebimento.'
          );
        }
        const planName = String(d.plan_name || student?.plan || '').trim();
        const doc = await createPayment({
          lead_id: leadId,
          academy_id: academyId,
          amount: amountNum,
          method,
          account: '',
          plan_name: planName,
          status: 'paid',
          reference_month: ym,
          paid_at: new Date().toISOString(),
          due_date: null,
          registered_by: userId || '',
          registered_by_name: sessionUserName,
          note: d.note != null && String(d.note).trim() ? String(d.note).trim() : 'Registrado via assistente',
          team_id: permissionContext.teamId
        }, {
          financeConfig,
          toast: toastAdapterFromAddToast(addToast),
        });
        if (typeof window !== 'undefined') {
          const refYm = String(doc?.reference_month || ym || '').trim();
          window.dispatchEvent(
            new CustomEvent('navi-student-payment-updated', { detail: { referenceMonth: refYm } })
          );
        }
        return doc;
      }

      if (parsed.action === 'inventory_query') {
        const resposta = String(parsed.data?.resposta || parsed.summary || '').trim();
        if (!resposta) throw new Error('Consulta de estoque sem resposta.');
        return { resposta };
      }

      if (parsed.action === 'academy_query') {
        const resposta = String(parsed.data?.resposta || parsed.summary || '').trim();
        if (!resposta) throw new Error('Consulta sem resposta.');
        return { resposta, rows: parsed.data?.rows || [] };
      }

      if (parsed.action === 'adjust_stock') {
        const d = parsed.data || {};
        const variantId = String(d.variant_id || d.stock_item_id || '').trim();
        const qtyChange = Number(d.quantity_change);
        const subtype = String(d.subtype || 'avaria').trim();
        if (!variantId) throw new Error('Variante não identificada');
        if (!Number.isFinite(qtyChange) || qtyChange === 0) throw new Error('Quantidade de ajuste inválida');

        const result = await useInventoryStore.getState().adjustStock({
          variant_id: variantId,
          quantity_change: qtyChange,
          subtype,
          note: d.note != null ? String(d.note).trim() : '',
        });
        if (!result?.sucesso) {
          throw new Error(useInventoryStore.getState().error || 'Erro ao ajustar estoque');
        }
        return {
          quantity_before: result.quantity_before,
          quantity_after: result.quantity_after,
          toast_message: formatAdjustToast(result.quantity_before, result.quantity_after),
        };
      }

      if (parsed.action === 'register_sale') {
        const d = parsed.data || {};
        const stockId = String(d.stock_item_id || '').trim();
        if (!stockId) throw new Error('Produto não identificado');
        const qty = Math.max(1, Math.trunc(Number(d.quantity) || 1));
        const unit = Number(d.unit_price);
        if (!Number.isFinite(unit) || unit <= 0) throw new Error('Preço da venda inválido');

        const forma = mapNlPaymentFormToSale(d.payment_form || d.method);
        if (forma && !isPaymentMethodActive(financeConfig, forma)) {
          throw new Error(
            'Esta forma de pagamento está desativada. Ative em Financeiro → Configurações → Formas de recebimento.'
          );
        }
        const pagamentos = [
          {
            forma,
            valor: Math.round(unit * qty * 100) / 100,
          },
        ];

        const body = await createSale({
          aluno_id: d.student_id ? String(d.student_id).trim() : null,
          cliente_nome: d.student_id ? null : String(d.customer_name || d.student_name || '').trim() || null,
          cliente_telefone: d.customer_phone ? String(d.customer_phone).trim() : null,
          venda_colaborador: false,
          sale_source: 'nl',
          itens: [
            {
              item_estoque_id: stockId,
              quantidade: qty,
              preco_unitario: unit,
            },
          ],
          pagamentos,
        });

        if (!body) {
          const err = useSalesStore.getState().error;
          throw new Error(err || 'Não foi possível registrar a venda.');
        }

        return {
          ...body,
          receipt_summary: {
            product: d.product_name,
            quantity: qty,
            unit_price: unit,
            total: Math.round(unit * qty * 100) / 100,
            payment_form: forma,
            client:
              d.student_name ||
              d.customer_name ||
              (d.student_id ? 'Aluno cadastrado' : 'Cliente avulso'),
          },
        };
      }

      if (parsed.action === 'add_note') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || d.student_id || '').trim();
        const noteText = String(d.note_text || '').trim();
        if (!leadId || !noteText) throw new Error('Nota ou aluno ausente');
        const doc = await addLeadEvent({
          academyId,
          leadId,
          type: 'note',
          text: noteText,
          createdBy: userId || 'user',
          permissionContext
        });
        if (!doc) throw new Error('Não foi possível gravar a nota (verifique permissões / coleção de eventos).');
        return doc;
      }

      if (parsed.action === 'mark_attended') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const now = new Date().toISOString();
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const attendedPatch = {
          status: LEAD_STATUS.COMPLETED,
          pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
          attendedAt: now,
          statusChangedAt: now,
        };
        await updateLead(leadId, attendedPatch);
        const attendedAuto = await safeAutomationDispatch(
          afterPresenceConfirmed({
            lead: lead ? { ...lead, ...attendedPatch } : { id: leadId, ...attendedPatch },
            academyId,
            waOutbound,
            academyRaw: automationsRaw,
            automationConfig,
            permissionContext,
            updateLead,
            getLead: () => (leads || []).find((l) => String(l.id || '').trim() === leadId) || null,
          }),
          'presence_confirmed'
        );
        notifyAutomationFeedback(addToast, attendedAuto);
        const out = await addLeadEvent({
          academyId,
          leadId,
          type: 'attended',
          from: lead?.pipelineStage || '',
          to: PIPELINE_WAITING_DECISION_STAGE,
          createdBy: userId || 'user',
          permissionContext
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'mark_missed') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const now = new Date().toISOString();
        const reason = String(d.reason || '').trim();
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const missedPatch = {
          status: LEAD_STATUS.MISSED,
          pipelineStage: LEAD_STATUS.MISSED,
          missedAt: now,
          missed_reason: reason,
          statusChangedAt: now,
        };
        await updateLead(leadId, missedPatch);
        const missedAuto = await safeAutomationDispatch(
          afterMissed({
            lead: lead ? { ...lead, ...missedPatch } : { id: leadId, ...missedPatch },
            academyId,
            waOutbound,
            academyRaw: automationsRaw,
            automationConfig,
            permissionContext,
          }),
          'missed'
        );
        notifyAutomationFeedback(addToast, missedAuto);
        const out = await addLeadEvent({
          academyId,
          leadId,
          type: 'missed',
          from: lead?.pipelineStage || '',
          to: LEAD_STATUS.MISSED,
          text: reason ? `Motivo: ${reason}` : '',
          createdBy: userId || 'user',
          permissionContext
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'mark_lost') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const lostReason = String(d.lost_reason || d.reason || '').trim() || 'Não especificado';
        const now = new Date().toISOString();
        await addLeadEvent({
          academyId,
          leadId,
          type: 'lost',
          from: lead?.status || '',
          to: LEAD_STATUS.LOST,
          text: lostReason.slice(0, 1000),
          createdBy: userId || 'user',
          permissionContext
        });
        const out = await updateLead(leadId, {
          status: LEAD_STATUS.LOST,
          scheduledDate: '',
          scheduledTime: '',
          pipelineStage: LEAD_STATUS.LOST,
          lostReason,
          lostAt: now,
          statusChangedAt: now
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'register_whatsapp') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const now = new Date().toISOString();
        const messageDescription = String(d.message_description || '').trim();
        const waEnabled = Boolean(String(waZapId || '').trim()) && Boolean(lead?.phone);

        if (waEnabled && lead) {
          const templateKey = 'dashboard_contact';
          const sendResult = await sendWhatsappTemplateOutbound({
            lead,
            academyId,
            academyName: waAcademyName || academyName,
            templateKey,
            templatesMap: waTemplates || DEFAULT_WHATSAPP_TEMPLATES,
            zapsterInstanceId: waZapId,
            onToast: (t) => addToast(t),
            suppressToasts: false,
            permissionContext,
            createdBy: userId || 'user',
          });
          if (sendResult?.ok) {
            await addLeadEvent({
              academyId,
              leadId,
              type: 'message',
              text: messageDescription
                ? `WhatsApp: ${messageDescription}`
                : 'WhatsApp: template de contato enviado',
              createdBy: userId || 'user',
              permissionContext,
            });
            const out = await updateLead(leadId, { lastWhatsappActivityAt: now });
            notifyLeadsRefresh();
            return { ...out, whatsapp_sent: true };
          }
        }

        await addLeadEvent({
          academyId,
          leadId,
          type: 'message',
          text: messageDescription
            ? `WhatsApp (registro): ${messageDescription}`
            : 'WhatsApp registrado no histórico (envio automático indisponível)',
          createdBy: userId || 'user',
          permissionContext,
        });
        const out = await updateLead(leadId, { lastWhatsappActivityAt: now });
        if (!waEnabled) {
          addToast({
            type: 'info',
            message: 'Registro salvo no histórico. WhatsApp não configurado ou telefone ausente.',
          });
        }
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'mark_enrolled') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const nowIso = new Date().toISOString();
        await addLeadEvent({
          academyId,
          leadId,
          type: 'converted',
          from: lead?.pipelineStage || '',
          to: LEAD_STATUS.CONVERTED,
          createdBy: userId || 'user',
          permissionContext
        });
        const out = await updateLead(leadId, {
          status: LEAD_STATUS.CONVERTED,
          contact_type: 'student',
          pipelineStage: 'Matriculado',
          convertedAt: nowIso,
          statusChangedAt: nowIso
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'schedule_experimental') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        if (!leadId) throw new Error('Lead não identificado');
        const ymd = String(d.scheduled_date || d.date || '').trim();
        const timeNorm = normalizeScheduleTime(d.scheduled_time || d.time || '');
        if (!isValidYmd(ymd)) throw new Error('Data de agendamento inválida.');
        if (!timeNorm) throw new Error('Horário de agendamento inválido.');
        const nowIso = new Date().toISOString();
        try {
          await addLeadEvent({
            academyId,
            leadId,
            type: 'schedule',
            to: ymd,
            text: 'Aula experimental agendada',
            createdBy: userId || 'user',
            permissionContext,
            payloadJson: { date: ymd, time: timeNorm }
          });
        } catch {
          void 0;
        }
        const schedulePatch = {
          status: LEAD_STATUS.SCHEDULED,
          scheduledDate: ymd,
          scheduledTime: timeNorm,
          pipelineStage: 'Aula experimental',
          statusChangedAt: nowIso,
        };
        const out = await updateLead(leadId, schedulePatch);
        const leadRow = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        const scheduleAuto = await safeAutomationDispatch(
          afterExperimentalScheduled({
            lead: leadRow ? { ...leadRow, ...schedulePatch } : { id: leadId, ...schedulePatch },
            ymd,
            time: timeNorm,
            academyId,
            waOutbound,
            academyRaw: automationsRaw,
            automationConfig,
            permissionContext,
            updateLead,
            getLead: () => (leads || []).find((l) => String(l.id || '').trim() === leadId) || null,
          }),
          'schedule_confirm'
        );
        notifyAutomationFeedback(addToast, scheduleAuto);
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'move_pipeline_stage') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        const toStage = String(d.target_stage_id || d.stage_id || d.pipeline_stage || '').trim();
        if (!leadId || !toStage) throw new Error('Lead ou etapa de destino ausente');
        if (MOVE_PIPELINE_FORBIDDEN_TARGETS.has(toStage)) {
          throw new Error(terms.nlPipelineMoveForbiddenHint);
        }
        const lead = (leads || []).find((l) => String(l.id || '').trim() === leadId);
        if (!lead) throw new Error('Lead não encontrado na lista.');
        const fromStage = String(lead.pipelineStage || lead.status || '').trim() || '—';
        if (fromStage === toStage) throw new Error('O lead já está nesta etapa.');
        const nowIso = new Date().toISOString();
        await addLeadEvent({
          academyId,
          leadId,
          type: 'pipeline_change',
          from: fromStage,
          to: toStage,
          createdBy: userId || 'user',
          permissionContext
        });
        const payload = getStageUpdatePayload(toStage);
        const out = await updateLead(leadId, { ...payload, statusChangedAt: nowIso });
        const moveAuto = await safeAutomationDispatch(
          afterMovedToPipelineStage({
            lead: lead ? { ...lead, ...payload, pipelineStage: toStage } : { id: leadId, ...payload },
            toStage,
            academyId,
            waOutbound,
            academyRaw: automationsRaw,
            automationConfig,
            permissionContext,
            updateLead,
            getLead: () => (leads || []).find((l) => String(l.id || '').trim() === leadId) || null,
          }),
          'waiting_decision'
        );
        notifyAutomationFeedback(addToast, moveAuto);
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'register_expense') {
        const d = parsed.data || {};
        const amount = Number(d.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Valor da despesa inválido');
        const descBase = String(d.expense_description || d.description || d.note || '').trim();
        if (!descBase) throw new Error('Descreva a despesa');
        const cat = String(d.expense_category || '').trim();
        const description = cat ? `${cat}: ${descBase}` : descBase;
        return createExpenseTransaction({
          academyId,
          teamId: permissionContext.teamId,
          userId: userId || '',
          amount,
          description,
          method: d.method
        });
      }

      if (parsed.action === 'register_checkin') {
        if (!isAttendanceConfigured()) {
          throw new Error('Presenças não configuradas para esta academia (coleção attendance).');
        }
        const d = parsed.data || {};
        const leadId = String(d.student_id || '').trim();
        if (!leadId) throw new Error('Aluno não identificado');
        if (!academyId) throw new Error('Academia não selecionada');
        const checkinDoc = await createCheckin(
          {
            lead_id: leadId,
            academy_id: academyId,
            checked_in_by: userId || 'user',
            checked_in_by_name: sessionUserName || 'Usuário'
          },
          permissionContext
        );
        emitLeadAttendanceChanged(leadId);
        return checkinDoc;
      }

      if (parsed.action === 'update_student') {
        const d = parsed.data || {};
        const leadId = String(d.student_id || '').trim();
        if (!leadId) throw new Error('Aluno não identificado');
        const patch = sanitizeStudentUpdatesForNl(d);
        if (Object.keys(patch).length === 0) throw new Error('Nenhum campo válido para atualizar.');
        const out = await updateLead(leadId, patch);
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'freeze_plan') {
        const d = parsed.data || {};
        const studentId = String(d.student_id || '').trim();
        if (!studentId) throw new Error('Aluno não identificado');
        const out = await freezeStudentApi({
          student_id: studentId,
          start_ymd: String(d.start_ymd || d.startYmd || '').slice(0, 10),
          end_ymd: d.end_ymd || d.endYmd || null,
          duration_days: d.duration_days ?? d.durationDays,
          reason: String(d.reason || '').trim(),
          indefinite: d.indefinite === true,
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'create_lead') {
        const d = parsed.data || {};
        const name = String(d.name || d.lead_name || '').trim();
        const phone = String(d.phone || d.lead_phone || '').replace(/\D/g, '');
        if (!name || name.length < 2) throw new Error('Nome do lead inválido.');
        if (!phone || phone.length < 10) throw new Error('Telefone inválido.');
        const typ = normalizeLeadProfileType(String(d.type || '').trim());
        const typeFinal = CREATE_LEAD_TYPES.has(typ) ? typ : 'Adulto';
        const out = await addLead({
          name,
          phone,
          type: typeFinal,
          origin: String(d.origin || '').trim().slice(0, 128),
          status: LEAD_STATUS.NEW,
          pipelineStage: 'Novo',
          scheduledDate: '',
          scheduledTime: '',
          parentName: '',
          age: '',
          isFirstExperience: 'Sim',
          belt: '',
          customAnswers: {},
          birthDate: ''
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'settle_transaction') {
        const d = parsed.data || {};
        const tid = String(d.transaction_id || '').trim();
        if (!tid) throw new Error('Transação não identificada.');
        if (!academyId) throw new Error('Academia não selecionada.');
        const jwt = await createSessionJwt();
        const response = await fetch('/api/agent?route=settle-finance-tx', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': academyId,
          },
          body: JSON.stringify({ transactionId: tid }),
        });
        let body = {};
        try {
          body = await response.json();
        } catch {
          void 0;
        }
        if (!response.ok) {
          throw new Error(body.error || 'Erro ao liquidar transação');
        }
        const snap = d.tx_snapshot;
        if (snap && typeof snap === 'object') {
          applySettleAccountingSideEffects(snap, academyId);
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('navi-financial-tx-settled', { detail: { id: tid } }));
        }
        return { ok: true, transaction_id: tid, ...body };
      }

      if (parsed.action === 'update_payment') {
        const d = parsed.data || {};
        const pid = String(d.payment_id || '').trim();
        if (!pid) throw new Error('Pagamento não identificado.');
        const patch = sanitizePaymentUpdatesForNl(d);
        if (Object.keys(patch).length === 0) throw new Error('Nenhum campo válido para atualizar no pagamento.');
        const doc = await updatePayment(pid, patch);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('navi-student-payment-updated', {
              detail: { paymentId: pid, referenceMonth: String(d.reference_month || '').trim() }
            })
          );
        }
        return doc;
      }

      throw new Error('Ação não suportada');
    },
    [
      academyId,
      userId,
      sessionUserName,
      permissionContext,
      updateLead,
      leads,
      addLead,
      createSale,
      terms.nlPipelineMoveForbiddenHint,
      waOutbound,
      automationsRaw,
      automationConfig,
      waZapId,
      waAcademyName,
      waTemplates,
      academyName,
      addToast,
      financeConfig,
    ]
  );

  return { interpret, execute, academyName };
}
