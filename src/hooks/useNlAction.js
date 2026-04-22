import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { account, createSessionJwt } from '../lib/appwrite';
import { createPayment } from '../lib/studentPayments';
import { addLeadEvent } from '../lib/leadEvents';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import { PIPELINE_WAITING_DECISION_STAGE } from '../constants/pipeline.js';

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
  const updateLead = useLeadStore((s) => s.updateLead);

  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  const permissionContext = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId) || {};
    return {
      teamId: String(cur.teamId || '').trim(),
      userId: String(userId || '').trim()
    };
  }, [academyList, academyId, userId]);

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
    async (text, context = 'financeiro') => {
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

      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

      const res = await fetch('/api/agent?route=nl-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyId || '').trim()
        },
        body: JSON.stringify({ text, students, leads: funnelLeads, academyName, context })
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

      if (parsed.action === 'register_payment') {
        const d = parsed.data || {};
        const leadId = String(d.student_id || '').trim();
        if (!leadId) throw new Error('Aluno não identificado');
        const ym = String(d.reference_month || '').trim();
        if (!ym) throw new Error('Mês de referência ausente');
        const amountNum = d.amount != null && d.amount !== '' ? Number(d.amount) : 0;
        const method = normalizePaymentMethod(d.method);
        return createPayment({
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
          team_id: permissionContext.teamId || ''
        });
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
        return addLeadEvent({
          academyId,
          leadId,
          type: 'attended',
          from: lead?.pipelineStage || '',
          to: PIPELINE_WAITING_DECISION_STAGE,
          createdBy: userId || 'user',
          permissionContext
        });
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
        return addLeadEvent({
          academyId,
          leadId,
          type: 'missed',
          from: lead?.pipelineStage || '',
          to: LEAD_STATUS.MISSED,
          text: reason ? `Motivo: ${reason}` : '',
          createdBy: userId || 'user',
          permissionContext
        });
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
        return updateLead(leadId, {
          lastWhatsappActivityAt: now
        });
      }

      throw new Error('Ação não suportada');
    },
    [academyId, userId, sessionUserName, permissionContext, updateLead, leads]
  );

  return { interpret, execute, academyName };
}
