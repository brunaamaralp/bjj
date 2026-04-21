import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { account } from '../lib/appwrite';
import { getMonthlyPayments, createPayment, updatePayment } from '../lib/studentPayments';
import { maskCurrency, parseCurrencyBRL } from '../lib/masks';
import { friendlyError } from '../lib/errorMessages';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    <div className="finance-page-root">
      <div className="finance-page-inner">
        <div className="animate-in">
          <h1 className="navi-page-title">Mensalidades</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6 }}>
            Controle de pagamentos{academyName ? ` · ${academyName}` : ''}
          </p>
        </div>

        <div
          className="flex items-center justify-between gap-3 mt-4 mb-4"
          style={{ flexWrap: 'wrap' }}
        >
          <div className="flex items-center gap-2">
            <button type="button" className="btn-outline" style={{ padding: '8px 12px' }} onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeft size={18} />
            </button>
            <span style={{ fontWeight: 700, fontSize: 15, textTransform: 'capitalize', minWidth: 180, textAlign: 'center' }}>
              {formatMonthTitle(currentMonth)}
            </span>
            <button
              type="button"
              className="btn-outline"
              style={{ padding: '8px 12px' }}
              onClick={nextMonth}
              disabled={isCurrentMonth}
              aria-label="Próximo mês"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 12,
            marginBottom: 20,
          }}
        >
          <div className="card" style={{ padding: 14 }}>
            <div className="text-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              Pagos
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', marginTop: 4 }}>{summary.paid}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="text-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              Inadimplentes
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)', marginTop: 4 }}>{summary.pending}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="text-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              A vencer (7 dias)
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#d97706', marginTop: 4 }}>{summary.soon}</div>
          </div>
          <div className="card" style={{ padding: 14 }}>
            <div className="text-small" style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
              Recebido este mês
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 4 }}>{fmtMoney(summary.totalReceived)}</div>
          </div>
        </div>

        <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: 'Todos' },
            { id: 'paid', label: 'Pagos' },
            { id: 'pending', label: 'Inadimplentes' },
            { id: 'soon', label: 'A vencer' },
            { id: 'none', label: 'Sem registro' },
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              className={filter === c.id ? 'btn-secondary' : 'btn-outline'}
              style={{ fontSize: 12, padding: '6px 12px', minHeight: 34 }}
              onClick={() => setFilter(c.id)}
            >
              {c.label}
            </button>
          ))}
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 160, maxWidth: 320 }}
            placeholder="Buscar por nome…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          {loading ? (
            <p className="text-small" style={{ padding: 20, color: 'var(--text-muted)' }}>
              Carregando…
            </p>
          ) : (
            <table className="finance-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Pagamento habitual</th>
                  <th>Status</th>
                  <th className="finance-num" style={{ width: 160 }}>
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--text-secondary)' }}>
                      Nenhum aluno neste filtro.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((student) => {
                    const payment = paymentMap[student.id];
                    const row = getRowStatus(student, payment, currentMonth);
                    const today0 = startOfLocalDay(new Date());
                    const venc = row.dueDate;
                    let vencCell = '—';
                    if (row.status === 'paid' && row.paidAt) {
                      vencCell = `Pago em ${formatDdMm(row.paidAt)}`;
                    } else if (venc && !Number.isNaN(venc.getTime())) {
                      const diff = Math.ceil((today0 - startOfLocalDay(venc)) / 86400000);
                      if (diff > 0) {
                        vencCell = `${formatDdMm(venc)} · ${diff} dia(s) em atraso`;
                      } else if (diff <= 0 && diff >= -7) {
                        const until = Math.abs(diff);
                        vencCell = `${formatDdMm(venc)} · vence em ${until} dia(s)`;
                      } else {
                        vencCell = formatDdMm(venc);
                      }
                    }

                    const amountNum = payment && payment.status === 'paid' ? Number(payment.amount) : null;
                    const valorCell =
                      amountNum != null && Number.isFinite(amountNum) && amountNum > 0
                        ? fmtMoney(amountNum)
                        : student.plan
                          ? String(student.plan)
                          : '—';

                    const prefM = student.preferredPaymentMethod;
                    const prefA = student.preferredPaymentAccount;

                    let badge = null;
                    if (row.status === 'paid' && payment) {
                      const m = METHOD_LABELS[payment.method] || payment.method;
                      const pd = payment.paid_at ? formatDdMm(parseYmdLocal(String(payment.paid_at).slice(0, 10))) : '';
                      badge = (
                        <span className="badge badge-success" style={{ whiteSpace: 'normal', textAlign: 'left' }}>
                          ✓ Pago · {m}
                          {pd ? ` · ${pd}` : ''}
                        </span>
                      );
                    } else if (row.status === 'pending') {
                      badge = (
                        <span className="badge" style={{ background: '#FEE2E2', color: '#991B1B' }}>
                          ● Inadimplente
                        </span>
                      );
                    } else if (row.status === 'soon') {
                      badge = (
                        <span className="badge badge-warning" style={{ whiteSpace: 'normal' }}>
                          ⚠ A vencer
                        </span>
                      );
                    } else {
                      badge = (
                        <span className="badge badge-secondary" style={{ opacity: 0.9 }}>
                          Sem registro
                        </span>
                      );
                    }

                    const vencStyle =
                      row.status === 'pending' && venc
                        ? { color: 'var(--danger)', fontWeight: 600 }
                        : row.status === 'soon'
                          ? { color: '#d97706', fontWeight: 600 }
                          : {};

                    return (
                      <tr key={student.id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{student.name || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{student.plan || '—'}</div>
                        </td>
                        <td style={vencStyle}>{vencCell}</td>
                        <td>{valorCell}</td>
                        <td>
                          {prefM ? (
                            <>
                              <div style={{ fontWeight: 500 }}>{METHOD_LABELS[prefM] || prefM}</div>
                              {prefA ? (
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{prefA}</div>
                              ) : null}
                            </>
                          ) : (
                            <span style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 12 }}>Não definido</span>
                          )}
                        </td>
                        <td>{badge}</td>
                        <td className="finance-num">
                          {row.status === 'paid' && payment?.status === 'paid' ? (
                            <button
                              type="button"
                              className="btn-outline"
                              style={{ fontSize: 11, padding: '4px 8px', minHeight: 30 }}
                              onClick={() => handleEstornar(payment)}
                            >
                              Estornar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: 12, padding: '6px 10px', minHeight: 34 }}
                              onClick={() => openPaymentModal(student, payment)}
                            >
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
          )}
        </div>
      </div>

      {showModal && selectedStudent && (
        <div
          className="navi-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mensalidades-modal-title"
          onClick={() => {
            if (!savingPayment) setShowModal(false);
          }}
        >
          <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480, width: '100%', padding: 20 }}>
            <h3 id="mensalidades-modal-title" className="navi-section-heading" style={{ marginBottom: 14 }}>
              Registrar pagamento — {selectedStudent.name}
            </h3>
            <div className="flex-col gap-3">
              <div className="form-group">
                <label>Valor (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="decimal"
                  value={payForm.amount}
                  onChange={(e) => setPayForm((f) => ({ ...f, amount: maskCurrency(e.target.value) }))}
                  placeholder="0,00"
                />
              </div>
              <div className="form-group">
                <label>Data do pagamento</label>
                <input
                  className="form-input"
                  type="date"
                  value={payForm.paid_at}
                  onChange={(e) => setPayForm((f) => ({ ...f, paid_at: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label>Forma de pagamento</label>
                <select
                  className="form-input"
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
              <div className="form-group">
                <label>Conta</label>
                <input
                  className="form-input"
                  value={payForm.account}
                  onChange={(e) => setPayForm((f) => ({ ...f, account: e.target.value }))}
                  placeholder="Ex: Sicoob, Nubank"
                />
              </div>
              <label className="flex items-center gap-2" style={{ fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={Boolean(payForm.saveAsPreferred)}
                  onChange={(e) => setPayForm((f) => ({ ...f, saveAsPreferred: e.target.checked }))}
                />
                Salvar como pagamento habitual deste aluno
              </label>
              <div className="form-group">
                <label>Observação (opcional)</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={payForm.note}
                  onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn-outline" disabled={savingPayment} onClick={() => setShowModal(false)}>
                Cancelar
              </button>
              <button type="button" className="btn-secondary" disabled={savingPayment} onClick={() => void handleSavePayment()}>
                {savingPayment ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
