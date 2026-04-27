import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { account, createSessionJwt } from '../lib/appwrite';
import { createPayment, updatePayment } from '../lib/studentPayments';
import { createExpenseTransaction } from '../lib/financeExpense';
import { createCheckin, isAttendanceConfigured } from '../lib/attendance.js';
import { normalizeScheduleTime, isValidYmd } from '../../lib/nlScheduleParse.js';
import { sanitizeStudentUpdatesForNl } from '../../lib/studentNlUpdates.js';
import { sanitizePaymentUpdatesForNl } from '../../lib/paymentNlUpdates.js';
import { applySettleAccountingSideEffects } from '../lib/financeTxSettle.js';
import { addLeadEvent } from '../lib/leadEvents';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';
import { getStageUpdatePayload } from '../lib/leadStageRules.js';
import { emitLeadAttendanceChanged, emitLeadsRefresh } from '../lib/leadTimelineEvents.js';

/** Etapas que exigem fluxo próprio (matrícula, perda, não compareceu, agenda experimental). */
const MOVE_PIPELINE_FORBIDDEN_TARGETS = new Set([
  'Matriculado',
  LEAD_STATUS.MISSED,
  LEAD_STATUS.LOST,
  'Aula experimental'
]);

const CREATE_LEAD_TYPES = new Set(['Adulto', 'Criança', 'Juniores']);

function normalizePaymentMethod(m) {
  const raw = String(m || '').trim().toLowerCase();
  if (!raw) return 'pix';
  const map = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    'cartão débito': 'cartão_débito',
    'cartao débito': 'cartão_débito',
    'cartão debito': 'cartão_débito',
    'cartao debito': 'cartão_débito',
    'cartão crédito': 'cartão_crédito',
    'cartao crédito': 'cartão_crédito',
    'cartão credito': 'cartão_crédito',
    'cartao credito': 'cartão_crédito',
    transferência: 'transferência',
    transferencia: 'transferência'
  };
  if (map[raw]) return map[raw];
  if (['cartão_débito', 'cartão_crédito', 'transferência', 'dinheiro', 'pix'].includes(raw)) return raw;
  return 'pix';
}

export function useNlAction() {
  const leads = useLeadStore((s) => s.leads);
  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);
  const storeTeamId = useLeadStore((s) => s.teamId);
  const updateLead = useLeadStore((s) => s.updateLead);
  const addLead = useLeadStore((s) => s.addLead);

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
          recentPayments: recentPaymentsPayload
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error || data?.erro || `Erro HTTP ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : 'Erro na requisição');
      }
      return data;
    },
    [leads, academyId, academyName]
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
        const amountNum = d.amount != null && d.amount !== '' ? Number(d.amount) : 0;
        const method = normalizePaymentMethod(d.method);
        const doc = await createPayment({
          lead_id: leadId,
          academy_id: academyId,
          amount: Number.isFinite(amountNum) ? amountNum : 0,
          method,
          account: '',
          plan_name: '',
          status: 'paid',
          reference_month: ym,
          paid_at: new Date().toISOString(),
          due_date: null,
          registered_by: userId || '',
          registered_by_name: sessionUserName,
          note: d.note != null && String(d.note).trim() ? String(d.note).trim() : 'Registrado via assistente',
          team_id: permissionContext.teamId
        });
        if (typeof window !== 'undefined') {
          const refYm = String(doc?.reference_month || ym || '').trim();
          window.dispatchEvent(
            new CustomEvent('navi-student-payment-updated', { detail: { referenceMonth: refYm } })
          );
        }
        return doc;
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
        await updateLead(leadId, {
          status: LEAD_STATUS.COMPLETED,
          pipelineStage: PIPELINE_WAITING_DECISION_STAGE,
          attendedAt: now,
          statusChangedAt: now
        });
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
        await updateLead(leadId, {
          status: LEAD_STATUS.MISSED,
          pipelineStage: LEAD_STATUS.MISSED,
          missedAt: now,
          missed_reason: reason,
          statusChangedAt: now
        });
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
        const now = new Date().toISOString();
        const messageDescription = String(d.message_description || '').trim();
        await addLeadEvent({
          academyId,
          leadId,
          type: 'message',
          text: messageDescription ? `WhatsApp: ${messageDescription}` : 'WhatsApp enviado',
          createdBy: userId || 'user',
          permissionContext
        });
        const out = await updateLead(leadId, {
          lastWhatsappActivityAt: now
        });
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
        const out = await updateLead(leadId, {
          status: LEAD_STATUS.SCHEDULED,
          scheduledDate: ymd,
          scheduledTime: timeNorm,
          pipelineStage: 'Aula experimental',
          statusChangedAt: nowIso
        });
        notifyLeadsRefresh();
        return out;
      }

      if (parsed.action === 'move_pipeline_stage') {
        const d = parsed.data || {};
        const leadId = String(d.lead_id || '').trim();
        const toStage = String(d.target_stage_id || d.stage_id || d.pipeline_stage || '').trim();
        if (!leadId || !toStage) throw new Error('Lead ou etapa de destino ausente');
        if (MOVE_PIPELINE_FORBIDDEN_TARGETS.has(toStage)) {
          throw new Error(
            'Esta etapa exige outro comando: matricular, não compareceu, perdido ou agendar experimental com data e hora.'
          );
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

      if (parsed.action === 'create_lead') {
        const d = parsed.data || {};
        const name = String(d.name || d.lead_name || '').trim();
        const phone = String(d.phone || d.lead_phone || '').replace(/\D/g, '');
        if (!name || name.length < 2) throw new Error('Nome do lead inválido.');
        if (!phone || phone.length < 10) throw new Error('Telefone inválido.');
        const typ = String(d.type || '').trim();
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
          notes: [],
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
    [academyId, userId, sessionUserName, permissionContext, updateLead, leads, addLead]
  );

  return { interpret, execute, academyName };
}
