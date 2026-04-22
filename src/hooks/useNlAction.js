import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { account, createSessionJwt } from '../lib/appwrite';
import { createPayment } from '../lib/studentPayments';
import { addLeadEvent } from '../lib/leadEvents';

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
    async (text) => {
      const students = leads
        .filter((l) => l.status === LEAD_STATUS.CONVERTED || l.contact_type === 'student')
        .map((l) => ({ id: l.id, name: l.name, plan: l.plan || '' }));

      const jwt = await createSessionJwt();
      if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

      const res = await fetch('/api/agent?route=nl-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyId || '').trim()
        },
        body: JSON.stringify({ text, students, academyName })
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
          note: d.note != null && String(d.note).trim() ? String(d.note).trim() : 'Registrado via assistente'
        });
      }

      if (parsed.action === 'add_note') {
        const d = parsed.data || {};
        const leadId = String(d.student_id || '').trim();
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

      throw new Error('Ação não suportada');
    },
    [academyId, userId, sessionUserName, permissionContext]
  );

  return { interpret, execute, academyName };
}
