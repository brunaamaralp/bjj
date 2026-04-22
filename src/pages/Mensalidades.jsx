import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { account } from '../lib/appwrite';
import { getMonthlyPayments, createPayment, updatePayment } from '../lib/studentPayments';
import { maskCurrency, parseCurrencyBRL } from '../lib/masks';
import { friendlyError } from '../lib/errorMessages';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const PAY_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartão_débito', label: 'Cartão débito' },
  { value: 'cartão_crédito', label: 'Cartão crédito' },
  { value: 'transferência', label: 'Transferência' },
];

const METHOD_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartão_débito: 'Cartão débito',
  cartão_crédito: 'Cartão crédito',
  transferência: 'Transferência',
};

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function parseYmdLocal(ymd) {
  if (!ymd) return null;
  const s = String(ymd).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return new Date(`${iso[1]}T12:00:00`);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

function enrollmentDay(student) {
  const d = parseYmdLocal(student.enrollmentDate);
  return d ? d.getDate() : null;
}

function dueDateInMonth(currentMonth, dayOfMonth) {
  if (!dayOfMonth || !currentMonth) return null;
  const d = new Date(`${currentMonth}-${String(dayOfMonth).padStart(2, '0')}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** @returns {{ status: 'paid'|'pending'|'soon'|'none', dueDate: Date|null, paidAt: Date|null }} */
function getRowStatus(student, payment, currentMonth) {
  const today0 = startOfLocalDay(new Date());

  if (payment && payment.status === 'paid') {
    const paidAt = payment.paid_at ? parseYmdLocal(String(payment.paid_at).slice(0, 10)) : null;
    return { status: 'paid', dueDate: null, paidAt };
  }

  if (payment && payment.status === 'pending') {
    const dueRaw = payment.due_date ? parseYmdLocal(String(payment.due_date).slice(0, 10)) : null;
    if (dueRaw && startOfLocalDay(dueRaw) < today0) {
      return { status: 'pending', dueDate: dueRaw, paidAt: null };
    }
    return { status: 'soon', dueDate: dueRaw, paidAt: null };
  }

  const day = enrollmentDay(student);
  const defaultDue = dueDateInMonth(currentMonth, day);
  if (defaultDue) {
    const due0 = startOfLocalDay(defaultDue);
    if (due0 < today0) return { status: 'pending', dueDate: defaultDue, paidAt: null };
    const daysUntil = Math.ceil((due0 - today0) / 86400000);
    if (daysUntil >= 0 && daysUntil <= 7) return { status: 'soon', dueDate: defaultDue, paidAt: null };
  }
  return { status: 'none', dueDate: defaultDue || null, paidAt: null };
}

function formatDdMm(d) {
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMonthTitle(ym) {
  try {
    return new Date(`${ym}-02T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return ym;
  }
}

function formatMonthTitleCapitalized(ym) {
  const raw = formatMonthTitle(ym);
  const s = String(raw || '').trim();
  if (!s) return ym;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Mensalidades() {
  const leads = useLeadStore((s) => s.leads);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const userId = useLeadStore((s) => s.userId);
  const updateLead = useLeadStore((s) => s.updateLead);
  const addToast = useUiStore((s) => s.addToast);

  const [currentMonth, setCurrentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [savingPayment, setSavingPayment] = useState(false);
  const [payForm, setPayForm] = useState({});
  const [sessionUserName, setSessionUserName] = useState('Usuário');

  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  const students = useMemo(
    () => leads.filter((l) => l.status === LEAD_STATUS.CONVERTED || l.contact_type === 'student'),
    [leads]
  );

  const isCurrentMonth = currentMonth === new Date().toISOString().slice(0, 7);

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

  useEffect(() => {
    if (!academyId) {
      setPayments([]);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    getMonthlyPayments(academyId, currentMonth)
      .then((docs) => {
        if (active) setPayments(docs);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [academyId, currentMonth]);

  const paymentMap = useMemo(() => {
    const map = {};
    const list = (payments || []).filter((p) => String(p.status || '').toLowerCase() !== 'cancelled');
    for (const p of list) {
      const lid = String(p.lead_id || '').trim();
      if (!lid) continue;
      const cur = map[lid];
      if (!cur) {
        map[lid] = p;
        continue;
      }
      if (p.status === 'paid') map[lid] = p;
      else if (cur.status !== 'paid') map[lid] = p;
    }
    return map;
  }, [payments]);

  const prevMonth = useCallback(() => {
    const d = new Date(`${currentMonth}-02T12:00:00`);
    d.setMonth(d.getMonth() - 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  }, [currentMonth]);

  const nextMonth = useCallback(() => {
    if (isCurrentMonth) return;
    const d = new Date(`${currentMonth}-02T12:00:00`);
    d.setMonth(d.getMonth() + 1);
    setCurrentMonth(d.toISOString().slice(0, 7));
  }, [currentMonth, isCurrentMonth]);

  const getStatus = useCallback(
    (student) => {
      const p = paymentMap[student.id];
      return getRowStatus(student, p, currentMonth).status;
    },
    [paymentMap, currentMonth]
  );

  const filteredStudents = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => filter === 'all' || getStatus(s) === filter)
      .filter((s) => !q || String(s.name || '').toLowerCase().includes(q));
  }, [students, filter, search, getStatus]);

  const summary = useMemo(() => {
    let paid = 0;
    let pending = 0;
    let soon = 0;
    let totalReceived = 0;
    for (const s of students) {
      const st = getStatus(s);
      if (st === 'paid') paid += 1;
      if (st === 'pending') pending += 1;
      if (st === 'soon') soon += 1;
    }
    for (const p of payments || []) {
      if (p.status === 'paid' && Number(p.amount) > 0) {
        totalReceived += Number(p.amount) || 0;
      }
    }
    return { paid, pending, soon, totalReceived };
  }, [students, payments, getStatus]);

  const filterCounts = useMemo(() => {
    const c = { all: students.length, paid: 0, pending: 0, soon: 0, none: 0 };
    for (const s of students) {
      const st = getStatus(s);
      if (st === 'paid') c.paid += 1;
      else if (st === 'pending') c.pending += 1;
      else if (st === 'soon') c.soon += 1;
      else if (st === 'none') c.none += 1;
    }
    return c;
  }, [students, getStatus]);

  const openPaymentModal = (student, payment) => {
    const day = enrollmentDay(student);
    const dueDate = dueDateInMonth(currentMonth, day);
    setSelectedStudent(student);
    setPayForm({
      reference_month: currentMonth,
      amount: '',
      method: student.preferredPaymentMethod || 'pix',
      account: student.preferredPaymentAccount || '',
      status: 'paid',
      paid_at: new Date().toISOString().slice(0, 10),
      due_date: dueDate ? dueDate.toISOString().slice(0, 10) : '',
      plan_name: student.plan || '',
      note: '',
      saveAsPreferred: !String(student.preferredPaymentMethod || '').trim(),
    });
    setShowModal(true);
  };

  const handleSavePayment = async () => {
    if (!selectedStudent || !academyId || savingPayment) return;
    const amountNum = parseCurrencyBRL(payForm.amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor maior que zero.' });
      return;
    }
    setSavingPayment(true);
    try {
      const doc = await createPayment({
        lead_id: selectedStudent.id,
        academy_id: academyId,
        amount: amountNum,
        method: payForm.method,
        account: payForm.account || '',
        status: 'paid',
        reference_month: currentMonth,
        paid_at: new Date(payForm.paid_at).toISOString(),
        due_date: null,
        registered_by: userId || '',
        registered_by_name: sessionUserName,
        plan_name: payForm.plan_name || selectedStudent.plan || '',
        note: payForm.note || '',
      });
      if (payForm.saveAsPreferred) {
        await updateLead(selectedStudent.id, {
          preferredPaymentMethod: payForm.method,
          preferredPaymentAccount: payForm.account || '',
        });
      }
      setPayments((prev) => [...(prev || []).filter((p) => String(p.lead_id) !== String(selectedStudent.id)), doc]);
      setShowModal(false);
      setSelectedStudent(null);
      addToast({ type: 'success', message: 'Pagamento registrado.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingPayment(false);
    }
  };

  const handleEstornar = async (payment) => {
    const id = payment?.$id;
    if (!id) return;
    if (!window.confirm('Estornar este pagamento? O status será alterado para cancelado.')) return;
    try {
      await updatePayment(id, { status: 'cancelled' });
      setPayments((prev) => prev.map((p) => (p.$id === id ? { ...p, status: 'cancelled' } : p)));
      addToast({ type: 'success', message: 'Pagamento estornado.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    }
  };

  const fmtMoney = (n) => {
    try {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${Number(n || 0).toFixed(2)}`;
    }
  };

  return (
    <div
      className="mensalidades-page animate-in"
      style={{
        padding: 24,
        maxWidth: 1040,
        margin: '0 auto',
        boxSizing: 'border-box',
        background: 'var(--surface, #fff)',
        width: '100%',
      }}
    >
      <style>
        {`
          .mensalidades-page .mensal-table-wrap { background: var(--surface, #fff); border: 0.5px solid var(--border-light, #e8e8ef); border-radius: 10px; overflow: hidden; }
          .mensalidades-page .mensal-table { width: 100%; border-collapse: collapse; min-width: 720px; }
          .mensalidades-page .mensal-table thead { background: var(--surface-hover, #f4f4f8); }
          .mensalidades-page .mensal-table th {
            font-size: 10px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.06em;
            padding: 10px 16px; text-align: left;
          }
          .mensalidades-page .mensal-table td {
            padding: 12px 16px; font-size: 12px; color: var(--text-primary, var(--text, #1a1a1a));
            border-top: 0.5px solid var(--border-light, #e8e8ef); vertical-align: middle;
          }
          .mensalidades-page .mensal-table tbody tr:hover td { background: var(--surface-hover, #f4f4f8); }
          .mensalidades-page .mensal-chip { font-size: 11px; padding: 5px 12px; border-radius: 20px; border: 0.5px solid var(--border-light, #e8e8ef); background: var(--surface, #fff); color: var(--text-secondary); cursor: pointer; }
          .mensalidades-page .mensal-chip--active { background: #5B3FBF; color: #fff; border-color: #5B3FBF; }
          .mensalidades-page .mensal-search:focus { border-color: #5B3FBF !important; outline: none; }
          .mensalidades-page .mensal-btn-pay { background: #5B3FBF; color: #fff; border: none; font-size: 11px; font-weight: 500; padding: 6px 14px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
          .mensalidades-page .mensal-btn-pay:hover { background: #4a31a0; }
          .mensalidades-page .mensal-btn-estornar { background: var(--surface, #fff); color: var(--text-secondary); border: 0.5px solid var(--border-light, #e8e8ef); font-size: 11px; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
          .mensalidades-page .mensal-btn-estornar:hover { background: #fef2f2; color: #A32D2D; border-color: #F7C1C1; }
          .mensalidades-page .mensal-modal-in { border: 0.5px solid var(--border-light, #e8e8ef); border-radius: 7px; padding: 8px 10px; font-size: 13px; width: 100%; box-sizing: border-box; background: var(--surface, #fff); color: var(--text-primary, inherit); }
          .mensalidades-page .mensal-modal-in:focus { border-color: #5B3FBF; outline: none; }
          @media (max-width: 900px) {
            .mensalidades-page .mensal-summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          }
          @media (max-width: 480px) {
            .mensalidades-page .mensal-summary-grid { grid-template-columns: 1fr !important; }
          }
        `}
      </style>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, color: 'var(--text-primary, var(--text, #1a1a1a))' }}>Mensalidades</h1>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
            Controle de pagamentos{academyName ? ` · ${academyName}` : ''}
          </p>
        </div>
        <div
          style={{
            background: 'var(--surface, #fff)',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Mês anterior"
            style={{
              background: 'none',
              border: 'none',
              color: '#5B3FBF',
              fontSize: 16,
              cursor: 'pointer',
              padding: 4,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ChevronLeft size={18} strokeWidth={2} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 500, minWidth: 130, textAlign: 'center', color: 'var(--text-primary, var(--text))' }}>
            {formatMonthTitleCapitalized(currentMonth)}
          </span>
          <button
            type="button"
            onClick={nextMonth}
            disabled={isCurrentMonth}
            aria-label="Próximo mês"
            style={{
              background: 'none',
              border: 'none',
              color: '#5B3FBF',
              fontSize: 16,
              cursor: isCurrentMonth ? 'not-allowed' : 'pointer',
              padding: 4,
              lineHeight: 1,
              display: 'flex',
              alignItems: 'center',
              opacity: isCurrentMonth ? 0.4 : 1,
            }}
          >
            <ChevronRight size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      <div
        className="mensal-summary-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: 'var(--surface, #fff)',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 600, color: '#3B6D11' }}>{summary.paid}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Pagos</div>
        </div>
        <div
          style={{
            background: 'var(--surface, #fff)',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 600, color: '#A32D2D' }}>{summary.pending}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Inadimplentes</div>
        </div>
        <div
          style={{
            background: 'var(--surface, #fff)',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 600, color: '#B45309' }}>{summary.soon}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>A vencer</div>
        </div>
        <div
          style={{
            background: 'var(--surface, #fff)',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 10,
            padding: '14px 16px',
          }}
        >
          <div style={{ fontSize: 24, fontWeight: 600, color: '#5B3FBF' }}>{fmtMoney(summary.totalReceived)}</div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>Recebido</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { id: 'all', label: 'Todos', count: filterCounts.all },
          { id: 'paid', label: 'Pagos', count: filterCounts.paid },
          { id: 'pending', label: 'Inadimplentes', count: filterCounts.pending },
          { id: 'soon', label: 'A vencer', count: filterCounts.soon },
          { id: 'none', label: 'Sem registro', count: filterCounts.none },
        ].map((c) => (
          <button
            key={c.id}
            type="button"
            className={`mensal-chip${filter === c.id ? ' mensal-chip--active' : ''}`}
            onClick={() => setFilter(c.id)}
          >
            {c.label} ({c.count})
          </button>
        ))}
        <input
          className="mensal-search"
          type="search"
          style={{
            flex: 1,
            minWidth: 180,
            fontSize: 12,
            padding: '6px 12px',
            border: '0.5px solid var(--border-light, #e8e8ef)',
            borderRadius: 20,
            background: 'var(--surface, #fff)',
            color: 'var(--text-primary, inherit)',
          }}
          placeholder="Buscar aluno..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="mensal-table-wrap">
        <table className="mensal-table">
          <thead>
            <tr>
              <th>Aluno</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Pagamento habitual</th>
              <th>Status</th>
              <th style={{ minWidth: 140 }}>Ação</th>
            </tr>
          </thead>
          <tbody className="mensal-tbody">
            {loading ? (
              <tr>
                <td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  Carregando…
                </td>
              </tr>
            ) : filteredStudents.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: 48, textAlign: 'center', verticalAlign: 'middle' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
                    <Users size={32} strokeWidth={1.5} aria-hidden />
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>Nenhum aluno encontrado</span>
                    <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tente ajustar os filtros ou a busca</span>
                  </div>
                </td>
              </tr>
            ) : (
              filteredStudents.map((student) => {
                const payment = paymentMap[student.id];
                const row = getRowStatus(student, payment, currentMonth);
                const today0 = startOfLocalDay(new Date());
                const venc = row.dueDate;
                let vencCell = '—';
                let vencStyle = { color: 'var(--text-secondary)', fontWeight: 400 };
                if (row.status === 'paid' && row.paidAt) {
                  vencCell = `Pago em ${formatDdMm(row.paidAt)}`;
                  vencStyle = { color: 'var(--text-secondary)', fontWeight: 500 };
                } else if (venc && !Number.isNaN(venc.getTime())) {
                  const diff = Math.ceil((today0 - startOfLocalDay(venc)) / 86400000);
                  if (diff > 0) {
                    vencCell = `${formatDdMm(venc)} · ${diff} dias em atraso`;
                    vencStyle = { color: '#A32D2D', fontWeight: 500 };
                  } else if (diff <= 0 && diff >= -7) {
                    const until = Math.abs(diff);
                    vencCell = `${formatDdMm(venc)} · vence em ${until} dias`;
                    vencStyle = { color: '#B45309', fontWeight: 500 };
                  } else {
                    vencCell = formatDdMm(venc);
                    vencStyle = { color: 'var(--text-secondary)', fontWeight: 400 };
                  }
                }

                const amountNum = payment && payment.status === 'paid' ? Number(payment.amount) : null;
                const valorCell =
                  amountNum != null && Number.isFinite(amountNum) && amountNum > 0 ? fmtMoney(amountNum) : '—';

                const prefM = student.preferredPaymentMethod;
                const prefA = student.preferredPaymentAccount;

                const badgeBase = {
                  fontSize: 10,
                  padding: '3px 9px',
                  borderRadius: 20,
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                };

                let badge = null;
                if (row.status === 'paid' && payment) {
                  const m = METHOD_LABELS[payment.method] || payment.method;
                  const pd = payment.paid_at ? formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10))) : '';
                  badge = (
                    <span style={{ ...badgeBase, background: '#EAF3DE', color: '#3B6D11' }}>
                      ✓ Pago · {m}
                      {pd ? ` · ${pd}` : ''}
                    </span>
                  );
                } else if (row.status === 'pending') {
                  badge = (
                    <span style={{ ...badgeBase, background: '#FCEBEB', color: '#A32D2D' }}>
                      ● Inadimplente
                    </span>
                  );
                } else if (row.status === 'soon') {
                  badge = (
                    <span style={{ ...badgeBase, background: '#FEF3C7', color: '#B45309' }}>
                      ⚠ A vencer
                    </span>
                  );
                } else {
                  badge = (
                    <span style={{ ...badgeBase, background: '#f0f0f8', color: 'var(--text-secondary)' }}>Sem registro</span>
                  );
                }

                return (
                  <tr key={student.id}>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: 13, color: 'var(--text-primary, var(--text))' }}>{student.name || '—'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{student.plan || '—'}</div>
                    </td>
                    <td style={vencStyle}>{vencCell}</td>
                    <td style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary, var(--text))' }}>{valorCell}</td>
                    <td>
                      {prefM ? (
                        <>
                          <div style={{ fontWeight: 500, fontSize: 12 }}>{METHOD_LABELS[prefM] || prefM}</div>
                          {prefA ? <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{prefA}</div> : null}
                        </>
                      ) : (
                        <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 11 }}>Não definido</span>
                      )}
                    </td>
                    <td>{badge}</td>
                    <td>
                      {row.status === 'paid' && payment?.status === 'paid' ? (
                        <button type="button" className="mensal-btn-estornar" onClick={() => handleEstornar(payment)}>
                          Estornar
                        </button>
                      ) : (
                        <button type="button" className="mensal-btn-pay" onClick={() => openPaymentModal(student, payment)}>
                          Registrar pagamento
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {showModal && selectedStudent && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="mensalidades-modal-title"
          onClick={() => {
            if (!savingPayment) setShowModal(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface, #fff)',
              borderRadius: 14,
              padding: 24,
              width: '100%',
              maxWidth: 400,
              boxShadow: '0 12px 40px rgba(0,0,0,0.18)',
              boxSizing: 'border-box',
            }}
          >
            <h3
              id="mensalidades-modal-title"
              style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 600, color: 'var(--text-primary, var(--text))' }}
            >
              {selectedStudent.name}
            </h3>
            <p style={{ margin: '0 0 18px', fontSize: 12, color: 'var(--text-secondary)' }}>{formatMonthTitleCapitalized(currentMonth)}</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="text-small" style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                    Valor (R$)
                  </label>
                  <input
                    className="mensal-modal-in"
                    type="text"
                    inputMode="decimal"
                    value={payForm.amount}
                    onChange={(e) => setPayForm((f) => ({ ...f, amount: maskCurrency(e.target.value) }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="text-small" style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                    Data do pagamento
                  </label>
                  <input
                    className="mensal-modal-in"
                    type="date"
                    value={payForm.paid_at}
                    onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="text-small" style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                  Forma de pagamento
                </label>
                <select
                  className="mensal-modal-in"
                  value={payForm.method}
                  onChange={(e) => setPayForm((f) => ({ ...f, method: e.target.value }))}
                >
                  {PAY_METHODS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-small" style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                  Conta
                </label>
                <input
                  className="mensal-modal-in"
                  value={payForm.account}
                  onChange={(e) => setPayForm((f) => ({ ...f, account: e.target.value }))}
                  placeholder="Ex: Sicoob, Nubank"
                />
              </div>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(payForm.saveAsPreferred)}
                  onChange={(e) => setPayForm((f) => ({ ...f, saveAsPreferred: e.target.checked }))}
                  style={{ accentColor: '#5B3FBF' }}
                />
                Salvar como pagamento habitual deste aluno
              </label>
              <div>
                <label className="text-small" style={{ display: 'block', marginBottom: 6, color: 'var(--text-secondary)', fontSize: 11 }}>
                  Observação (opcional)
                </label>
                <textarea
                  className="mensal-modal-in"
                  rows={2}
                  value={payForm.note}
                  onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                  style={{ resize: 'vertical', minHeight: 56 }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                disabled={savingPayment}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 7,
                  border: '0.5px solid var(--border-light, #e8e8ef)',
                  background: 'var(--surface, #fff)',
                  color: 'var(--text-secondary)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: savingPayment ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={savingPayment}
                onClick={() => void handleSavePayment()}
                style={{
                  flex: 2,
                  padding: '10px 12px',
                  borderRadius: 7,
                  border: 'none',
                  background: '#5B3FBF',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: savingPayment ? 'not-allowed' : 'pointer',
                }}
              >
                {savingPayment ? 'Salvando…' : 'Confirmar pagamento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
