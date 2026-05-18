import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Query, ID } from 'appwrite';
import { ChevronLeft, ChevronRight, Download, Plus, Receipt } from 'lucide-react';
import { databases, DB_ID, FINANCIAL_TX_COL } from '../../lib/appwrite';
import { getMonthlyPayments } from '../../lib/studentPayments';
import { buildClientDocumentPermissions } from '../../lib/clientDocumentPermissions.js';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks';
import { isStudentRecord, isActiveStudent } from '../../lib/studentStatus.js';
import EmptyState from '../shared/EmptyState.jsx';
import {
  buildClosingRows,
  filterClosingRows,
  sortClosingRows,
  computeClosingTotals,
  exportClosingCsv,
  CLOSING_ORIGINS,
  CLOSING_ORIGIN_LABELS,
  CLOSING_SITUATIONS,
  CLOSING_SITUATION_LABELS,
  mapOriginToTxType,
} from '../../lib/monthlyClosing.js';

const PAY_METHODS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartão_débito', label: 'Cartão débito' },
  { value: 'cartão_crédito', label: 'Cartão crédito' },
  { value: 'transferência', label: 'Transferência' },
];

function formatMonthTitle(ym) {
  const [y, m] = String(ym || '').split('-').map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  try {
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return ym;
  }
}

function currentYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthlyClosingTab({ academyId, academyName, financeConfig, modules }) {
  const leads = useLeadStore((s) => s.leads);
  const userId = useLeadStore((s) => s.userId);
  const teamId = useLeadStore((s) => s.teamId);
  const addToast = useUiStore((s) => s.addToast);

  const [referenceMonth, setReferenceMonth] = useState(currentYm);
  const [loading, setLoading] = useState(false);
  const [payments, setPayments] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [originFilter, setOriginFilter] = useState(() => new Set(CLOSING_ORIGINS));
  const [situationFilter, setSituationFilter] = useState(() => new Set(CLOSING_SITUATIONS));
  const [methodFilter, setMethodFilter] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [showManual, setShowManual] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualForm, setManualForm] = useState({
    lead_id: '',
    studentQuery: '',
    description: '',
    gross: '',
    method: 'pix',
    account: '',
    date: new Date().toISOString().slice(0, 10),
    origin: 'outro',
  });

  const salesEnabled = modules?.sales === true;

  const availableOrigins = useMemo(() => {
    if (salesEnabled) return CLOSING_ORIGINS;
    return CLOSING_ORIGINS.filter((o) => o !== 'produto');
  }, [salesEnabled]);

  const leadById = useMemo(() => {
    const map = new Map();
    for (const l of leads || []) {
      if (l?.id) map.set(String(l.id), l);
    }
    return map;
  }, [leads]);

  const loadData = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const ym = referenceMonth;
      const payDocs = await getMonthlyPayments(academyId, ym);
      setPayments(payDocs);

      let txs = [];
      if (FINANCIAL_TX_COL) {
        const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, [
          Query.equal('academyId', academyId),
          Query.limit(300),
          Query.orderDesc('$createdAt'),
        ]);
        txs = (res.documents || []).map((d) => ({
          id: d.$id,
          saleId: d.saleId || '',
          lead_id: d.lead_id || '',
          method: d.method || '',
          installments: Number(d.installments || 1),
          type: d.type || '',
          planName: d.planName || '',
          gross: Number(d.gross || 0),
          fee: Number(d.fee || 0),
          net: Number(d.net || 0),
          status: d.status || 'pending',
          createdAt: d.$createdAt,
          settledAt: d.settledAt || '',
          note: d.note || '',
        }));
      }
      setTransactions(txs);
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'load') });
      setPayments([]);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [academyId, referenceMonth, addToast]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    const onPayment = () => void loadData();
    window.addEventListener('navi-student-payment-updated', onPayment);
    return () => window.removeEventListener('navi-student-payment-updated', onPayment);
  }, [loadData]);

  const allRows = useMemo(() => {
    const { rows } = buildClosingRows({
      payments,
      transactions,
      leadById,
      financeConfig,
      referenceMonth,
    });
    return rows.filter((r) => r.origin !== 'produto' || salesEnabled);
  }, [payments, transactions, leadById, financeConfig, referenceMonth, salesEnabled]);

  const methodOptions = useMemo(() => {
    const set = new Set();
    for (const r of allRows) {
      if (r.paymentMethodKey) set.add(r.paymentMethodKey);
    }
    return Array.from(set).sort();
  }, [allRows]);

  const filteredRows = useMemo(() => {
    const origins = new Set(
      [...originFilter].filter((o) => availableOrigins.includes(o))
    );
    return filterClosingRows(allRows, {
      origins,
      situations: situationFilter,
      paymentMethodKey: methodFilter,
    });
  }, [allRows, originFilter, situationFilter, methodFilter, availableOrigins]);

  const sortedRows = useMemo(() => sortClosingRows(filteredRows, sortBy), [filteredRows, sortBy]);
  const totals = useMemo(() => computeClosingTotals(sortedRows), [sortedRows]);

  const studentMatches = useMemo(() => {
    const q = String(manualForm.studentQuery || '').trim().toLowerCase();
    if (q.length < 2) return [];
    return (leads || [])
      .filter((l) => isStudentRecord(l) && isActiveStudent(l))
      .filter((l) => String(l.name || '').toLowerCase().includes(q))
      .slice(0, 10);
  }, [leads, manualForm.studentQuery]);

  const fmtMoney = (n) => {
    try {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } catch {
      return `R$ ${Number(n || 0).toFixed(2)}`;
    }
  };

  const isCurrentMonth = referenceMonth === currentYm();

  const prevMonth = () => {
    const [y, m] = referenceMonth.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setReferenceMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMonth = () => {
    const [y, m] = referenceMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    setReferenceMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const toggleOrigin = (key) => {
    setOriginFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(availableOrigins);
      return next;
    });
  };

  const toggleSituation = (key) => {
    setSituationFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (next.size === 0) return new Set(CLOSING_SITUATIONS);
      return next;
    });
  };

  const handleExport = () => {
    const { body, fileName } = exportClosingCsv(sortedRows, { academyName, referenceMonth });
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    addToast({ type: 'success', message: 'CSV exportado.' });
  };

  const saveManualReceipt = async () => {
    const grossNum = parseCurrencyBRL(manualForm.gross);
    if (!academyId || !FINANCIAL_TX_COL || !Number.isFinite(grossNum) || grossNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor válido.' });
      return;
    }
    const desc = String(manualForm.description || '').trim();
    if (!desc) {
      addToast({ type: 'error', message: 'Informe a descrição.' });
      return;
    }
    setSavingManual(true);
    try {
      const settledAt = manualForm.date
        ? new Date(`${manualForm.date}T12:00:00`).toISOString()
        : new Date().toISOString();
      const permissions =
        userId || teamId
          ? buildClientDocumentPermissions({ userId: String(userId || ''), teamId: String(teamId || '') })
          : null;
      const txType = mapOriginToTxType(manualForm.origin);
      const payload = {
        academyId,
        saleId: '',
        lead_id: manualForm.lead_id || '',
        method: manualForm.method,
        installments: 1,
        type: txType,
        planName: desc,
        gross: grossNum,
        fee: 0,
        net: grossNum,
        status: 'settled',
        settledAt,
        note: desc,
      };
      const doc = permissions
        ? await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), payload, permissions)
        : await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), payload);
      const row = {
        id: doc.$id,
        saleId: '',
        lead_id: doc.lead_id || manualForm.lead_id || '',
        method: doc.method || manualForm.method,
        installments: 1,
        type: doc.type || txType,
        planName: doc.planName || desc,
        gross: Number(doc.gross ?? grossNum),
        fee: 0,
        net: Number(doc.net ?? grossNum),
        status: 'settled',
        createdAt: doc.$createdAt,
        settledAt: doc.settledAt || settledAt,
        note: doc.note || desc,
      };
      setTransactions((prev) => [row, ...prev]);
      setShowManual(false);
      setManualForm({
        lead_id: '',
        studentQuery: '',
        description: '',
        gross: '',
        method: 'pix',
        account: '',
        date: new Date().toISOString().slice(0, 10),
        origin: 'outro',
      });
      addToast({ type: 'success', message: 'Recebimento lançado.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingManual(false);
    }
  };

  return (
    <section className="mt-4 animate-in monthly-closing-tab">
      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="navi-section-heading" style={{ margin: 0 }}>
          Fechamento mensal
        </h3>
        <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'var(--surface-hover)',
              borderRadius: 8,
              padding: '4px 10px',
            }}
          >
            <button type="button" className="btn-action-ghost" onClick={prevMonth} aria-label="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 140, textAlign: 'center' }}>
              {formatMonthTitle(referenceMonth)}
            </span>
            <button
              type="button"
              className="btn-action-ghost"
              onClick={nextMonth}
              disabled={isCurrentMonth}
              aria-label="Próximo mês"
            >
              <ChevronRight size={16} />
            </button>
          </div>
          <button type="button" className="btn-outline btn-sm" onClick={handleExport} disabled={!sortedRows.length}>
            <Download size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Exportar CSV
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowManual((v) => !v)}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            Lançar recebimento
          </button>
        </div>
      </div>

      {showManual ? (
        <div className="card mb-3" style={{ padding: 14 }}>
          <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, minWidth: 180, flex: 1, position: 'relative' }}>
              <label className="text-xs">Aluno (opcional)</label>
              <input
                className="form-input"
                value={manualForm.studentQuery}
                onChange={(e) =>
                  setManualForm((f) => ({ ...f, studentQuery: e.target.value, lead_id: '' }))
                }
                placeholder="Buscar por nome…"
              />
              {studentMatches.length > 0 && !manualForm.lead_id ? (
                <div
                  className="card"
                  style={{
                    position: 'absolute',
                    zIndex: 5,
                    marginTop: 4,
                    padding: 4,
                    maxHeight: 160,
                    overflow: 'auto',
                  }}
                >
                  {studentMatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="btn-action-ghost"
                      style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                      onClick={() =>
                        setManualForm((f) => ({
                          ...f,
                          lead_id: s.id,
                          studentQuery: s.name || '',
                        }))
                      }
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 160, flex: 1 }}>
              <label className="text-xs">Descrição</label>
              <input
                className="form-input"
                value={manualForm.description}
                onChange={(e) => setManualForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ margin: 0, width: 120 }}>
              <label className="text-xs">Valor</label>
              <input
                className="form-input"
                value={manualForm.gross}
                onChange={(e) => setManualForm((f) => ({ ...f, gross: maskCurrency(e.target.value) }))}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
              <label className="text-xs">Forma</label>
              <select
                className="form-input"
                value={manualForm.method}
                onChange={(e) => setManualForm((f) => ({ ...f, method: e.target.value }))}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, width: 130 }}>
              <label className="text-xs">Data</label>
              <input
                type="date"
                className="form-input navi-date-filter"
                value={manualForm.date}
                onChange={(e) => setManualForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
              <label className="text-xs">Origem</label>
              <select
                className="form-input"
                value={manualForm.origin}
                onChange={(e) => setManualForm((f) => ({ ...f, origin: e.target.value }))}
              >
                {availableOrigins.map((o) => (
                  <option key={o} value={o}>
                    {CLOSING_ORIGIN_LABELS[o]}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn-primary btn-sm"
              disabled={savingManual}
              onClick={() => void saveManualReceipt()}
            >
              {savingManual ? 'Salvando…' : 'Salvar'}
            </button>
            <button type="button" className="btn-outline btn-sm" onClick={() => setShowManual(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 600 }}>{fmtMoney(totals.expected)}</div>
          <div className="text-xs text-muted">Total esperado</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#3B6D11' }}>{fmtMoney(totals.received)}</div>
          <div className="text-xs text-muted">Total recebido</div>
        </div>
        <div className="card" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: '#A32D2D' }}>{fmtMoney(totals.pending)}</div>
          <div className="text-xs text-muted">Total pendente</div>
        </div>
        <div className="card" style={{ padding: '12px 14px', gridColumn: 'span 2' }}>
          <div className="text-xs text-muted" style={{ marginBottom: 6 }}>
            Por forma de pagamento
          </div>
          <div className="text-small" style={{ lineHeight: 1.5 }}>
            {totals.byMethod.length === 0
              ? '—'
              : totals.byMethod.map((m, i) => (
                  <span key={m.label}>
                    {i > 0 ? ' · ' : ''}
                    {m.label} {fmtMoney(m.amount)}
                  </span>
                ))}
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="text-xs">Origem</label>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {availableOrigins.map((key) => (
              <button
                key={key}
                type="button"
                className="btn-outline btn-sm"
                style={
                  originFilter.has(key)
                    ? { background: 'var(--v100)', borderColor: 'var(--v500)', color: 'var(--v500)' }
                    : undefined
                }
                onClick={() => toggleOrigin(key)}
              >
                {CLOSING_ORIGIN_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="text-xs">Situação</label>
          <div className="flex gap-1" style={{ flexWrap: 'wrap' }}>
            {CLOSING_SITUATIONS.map((key) => (
              <button
                key={key}
                type="button"
                className="btn-outline btn-sm"
                style={
                  situationFilter.has(key)
                    ? { background: 'var(--surface-hover)' }
                    : undefined
                }
                onClick={() => toggleSituation(key)}
              >
                {CLOSING_SITUATION_LABELS[key]}
              </button>
            ))}
          </div>
        </div>
        {methodOptions.length > 0 ? (
          <div className="form-group" style={{ margin: 0, minWidth: 160 }}>
            <label className="text-xs">Forma de pagamento</label>
            <select className="form-input" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value)}>
              <option value="all">Todas</option>
              {methodOptions.map((k) => (
                <option key={k} value={k}>
                  {k.split('|')[0] || k}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="form-group" style={{ margin: 0, minWidth: 140 }}>
          <label className="text-xs">Ordenar</label>
          <select className="form-input" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
            <option value="date">Data (recente)</option>
            <option value="name">Nome</option>
            <option value="received">Valor recebido</option>
            <option value="expected">Valor esperado</option>
          </select>
        </div>
      </div>

      <div className="finance-table-wrap">
        <table className="finance-table" style={{ minWidth: 960 }}>
          <thead>
            <tr>
              <th>Nome</th>
              <th>Descrição</th>
              <th className="finance-num">Esperado</th>
              <th className="finance-num">Recebido</th>
              <th className="finance-num">Pendente</th>
              <th>Forma</th>
              <th>Data</th>
              <th>Situação</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>
                  Carregando…
                </td>
              </tr>
            ) : sortedRows.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ padding: 20 }}>
                  <EmptyState
                    variant="table-cell"
                    icon={Receipt}
                    title="Nenhum recebimento neste mês"
                    description="Os lançamentos aparecem aqui quando mensalidades são pagas, vendas concluídas ou recebimentos manuais são registrados."
                  />
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => {
                const dt = row.date ? new Date(row.date) : null;
                const dateStr = dt && !Number.isNaN(dt.getTime())
                  ? `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
                  : '—';
                const nameCell = row.guardian ? `${row.name} (${row.guardian})` : row.name;
                const sitColor =
                  row.situation === 'recebido'
                    ? { bg: '#EAF3DE', color: '#3B6D11' }
                    : row.situation === 'parcial'
                      ? { bg: '#FFEDD5', color: '#C2410C' }
                      : { bg: '#FCEBEB', color: '#A32D2D' };
                return (
                  <tr key={row.id}>
                    <td style={{ fontWeight: 500, fontSize: 13 }}>{nameCell}</td>
                    <td className="text-small">{row.description}</td>
                    <td className="finance-num">{fmtMoney(row.expected)}</td>
                    <td className="finance-num">{fmtMoney(row.received)}</td>
                    <td className="finance-num">
                      {row.pending > 0.009 ? (
                        <span style={{ color: '#A32D2D', fontWeight: 600 }}>{fmtMoney(row.pending)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="text-small">{row.paymentMethod}</td>
                    <td>{dateStr}</td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '4px 10px',
                          borderRadius: 20,
                          background: sitColor.bg,
                          color: sitColor.color,
                        }}
                      >
                        {CLOSING_SITUATION_LABELS[row.situation]}
                      </span>
                    </td>
                    <td className="text-small">{CLOSING_ORIGIN_LABELS[row.origin]}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
