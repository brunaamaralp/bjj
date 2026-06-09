// Desacoplado do modal Nova Venda em 2026-05-27.
// Reutilizado em: perfil do lead (LeadCloseSaleModal), funil (Pipeline).

import React, { useCallback, useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { databases, DB_ID, STUDENTS_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { createPayment, PAYMENT_CATEGORY } from '../../lib/studentPayments.js';
import { centsToNumber, parseMaskToCents } from '../../lib/moneyBr';
import { validateBankAccountForPayment } from '../../lib/bankAccounts.js';
import { trocoFieldsForPaymentPayload, validateStudentPaymentTroco } from '../../lib/studentPaymentTroco.js';
import { prefetchFinanceConfig } from '../../lib/prefetchFinanceConfig.js';
import { friendlyError } from '../../lib/errorMessages.js';
import StudentPaymentModal, {
  buildDefaultPayForm,
} from '../student/StudentPaymentModal.jsx';

function mapStudentDoc(doc) {
  if (!doc) return null;
  return {
    id: doc.$id,
    name: String(doc.name || doc.nome || '').trim(),
    plan: doc.plan || '',
    plan_price: doc.plan_price,
    preferredPaymentMethod: doc.preferredPaymentMethod || '',
    preferredPaymentAccount: doc.preferredPaymentAccount || '',
  };
}

function buildPayFormForContact(contact, financeConfig) {
  return { ...buildDefaultPayForm(contact, financeConfig), payment_type: PAYMENT_CATEGORY.PLAN };
}

export default function NovaVendaPlanPanel({
  onComplete,
  onBack,
  prefilledStudent = null,
  showNotStudentHint = false,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const userId = useLeadStore((s) => s.userId);
  const addToast = useUiStore((s) => s.addToast);

  const [searchText, setSearchText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [student, setStudent] = useState(() => prefilledStudent || null);
  const [payForm, setPayForm] = useState(() =>
    prefilledStudent ? buildPayFormForContact(prefilledStudent, financeConfig) : null
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (academyId) void prefetchFinanceConfig(academyId);
  }, [academyId]);

  useEffect(() => {
    if (!prefilledStudent) return;
    setStudent(prefilledStudent);
    setPayForm(buildPayFormForContact(prefilledStudent, financeConfig));
    setFormError('');
  }, [prefilledStudent?.id, financeConfig]);

  useEffect(() => {
    if (prefilledStudent) return undefined;
    if (!academyId || !STUDENTS_COL || !DB_ID || searchText.trim().length < 2) {
      setSuggestions([]);
      return undefined;
    }
    const q = searchText.trim();
    let cancelled = false;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await databases.listDocuments(DB_ID, STUDENTS_COL, [
          Query.equal('academy_id', academyId),
          Query.limit(8),
          Query.search('name', q),
        ]);
        if (cancelled) return;
        setSuggestions((res.documents || []).map(mapStudentDoc).filter(Boolean));
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [academyId, searchText, prefilledStudent]);

  const chooseStudent = useCallback((s) => {
    setStudent(s);
    setSearchText(s.name);
    setSuggestions([]);
    setPayForm(buildPayFormForContact(s, financeConfig));
    setFormError('');
  }, [financeConfig]);

  const clearStudent = useCallback(() => {
    setStudent(null);
    setPayForm(null);
    setSearchText('');
    setFormError('');
  }, []);

  const handleSave = useCallback(async () => {
    if (!student || !academyId || !payForm || saving) return;
    setFormError('');
    const paymentType = payForm.payment_type || PAYMENT_CATEGORY.PLAN;
    if (paymentType !== PAYMENT_CATEGORY.PLAN && paymentType !== PAYMENT_CATEGORY.BUNDLE) {
      addToast({ type: 'error', message: 'Selecione mensalidade ou plano com cobertura.' });
      return;
    }
    const amountNum = centsToNumber(parseMaskToCents(payForm.amount));
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor maior que zero.' });
      return;
    }
    const trocoCheck = validateStudentPaymentTroco(payForm, amountNum, financeConfig);
    if (!trocoCheck.ok) {
      addToast({ type: 'error', message: trocoCheck.message });
      return;
    }

    const accountCheck = validateBankAccountForPayment(payForm.account, financeConfig);
    if (!accountCheck.ok) {
      addToast({ type: 'error', message: accountCheck.message });
      return;
    }
    const paymentAccount = accountCheck.account || payForm.account || '';

    const paidAtIso =
      (payForm.status === 'paid' || paymentType === PAYMENT_CATEGORY.BUNDLE) && payForm.paid_at
        ? new Date(payForm.paid_at).toISOString()
        : null;

    const data = {
      lead_id: student.id,
      academy_id: academyId,
      amount: amountNum,
      paid_amount: amountNum,
      method: payForm.method,
      account: paymentAccount,
      plan_name: payForm.plan_name || student.plan || '',
      status: payForm.status,
      payment_category: paymentType,
      due_date:
        payForm.status === 'pending' && payForm.due_date
          ? new Date(payForm.due_date).toISOString()
          : null,
      paid_at: paidAtIso,
      registered_by: userId || '',
      registered_by_name: 'Usuário',
      note: String(payForm.note || '').trim(),
      ...trocoFieldsForPaymentPayload(payForm, amountNum, financeConfig),
    };

    if (paymentType === PAYMENT_CATEGORY.BUNDLE) {
      data.bundle_months = Number(payForm.bundle_months) || 12;
      data.coverage_start_month = payForm.bundle_start_month;
      data.reference_month = payForm.bundle_start_month;
    } else {
      data.reference_month = payForm.reference_month;
    }

    setSaving(true);
    try {
      const doc = await createPayment(data);
      addToast({ type: 'success', message: 'Mensalidade registrada.' });
      if (doc?.warning) {
        addToast({
          type: 'warning',
          message:
            String(doc.warning || '').trim() ||
            'Pagamento registrado, mas houve um problema ao atualizar o caixa.',
          duration: 10000,
        });
      }
      onComplete?.();
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Já existe um lançamento')) {
        setFormError(msg);
        return;
      }
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  }, [student, academyId, payForm, saving, financeConfig, userId, addToast, onComplete]);

  const inputStyle = { fontSize: 14 };

  if (student && payForm) {
    return (
      <>
        {showNotStudentHint ? (
          <p
            role="status"
            style={{
              margin: '0 0 12px',
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--surface-2, rgba(148,163,184,0.12))',
              color: 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            Este contato ainda não é aluno. O pagamento será registrado e a matrícula pode ser feita
            em seguida.
          </p>
        ) : null}
        <StudentPaymentModal
          open
          student={student}
          academyId={academyId}
          financeConfig={financeConfig}
          payForm={payForm}
          setPayForm={setPayForm}
          saving={saving}
          inputStyle={inputStyle}
          onClose={() => {
            if (!saving) {
              if (prefilledStudent) onBack?.();
              else clearStudent();
            }
          }}
          onSave={handleSave}
          salesEnabled={false}
          formError={formError}
        />
      </>
    );
  }

  return (
    <div className="nova-venda-plan-panel">
      <button type="button" className="btn-ghost nova-venda-plan-panel__back" onClick={onBack}>
        ← Voltar
      </button>
      <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>
        Busque o aluno para registrar a mensalidade ou plano.
      </p>
      <div className="form-group">
        <label>Aluno</label>
        <input
          className="form-input"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Nome ou celular"
          autoFocus
        />
        {suggestions.length > 0 ? (
          <div className="sales-suggestions">
            {suggestions.map((s) => (
              <button key={s.id} type="button" className="sales-suggestion" onClick={() => chooseStudent(s)}>
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        ) : null}
        {busy ? <div className="text-small text-muted mt-1">Buscando…</div> : null}
      </div>
    </div>
  );
}
