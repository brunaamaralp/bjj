import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, FINANCIAL_TX_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { Query, ID } from 'appwrite';
import { LEAD_STATUS } from '../../lib/leadStatus';
import { Receipt } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { maskCurrency, parseCurrencyBRL } from '../../lib/masks.js';
import { settleFinancialTransactionById, applySettleAccountingSideEffects } from '../../lib/financeTxSettle.js';

export default function TransacoesTab({ academyId, financeConfig, onTransactionsChange }) {
  const leads = useLeadStore((s) => s.leads);
  const addToast = useUiStore((s) => s.addToast);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [showTxModal, setShowTxModal] = useState(false);
  const [txForm, setTxForm] = useState({
    type: 'plan',
    planName: '',
    method: 'pix',
    gross: '',
    fee: '',
    installments: 1,
    note: '',
    lead_id: ''
  });
  const [savingTx, setSavingTx] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);

  const initialTxForm = () => ({
    type: 'plan',
    planName: '',
    method: 'pix',
    gross: '',
    fee: '',
    installments: 1,
    note: '',
    lead_id: ''
  });

  const studentMatches = useMemo(() => {
    const q = String(studentQuery || '').trim().toLowerCase();
    if (q.length < 3) return [];
    return (leads || []).filter((l) => {
      if (l.contact_type !== 'student' || l.status !== LEAD_STATUS.CONVERTED) return false;
      const name = String(l.name || '').toLowerCase();
      const phone = String(l.phone || '').replace(/\D/g, '');
      const qd = q.replace(/\D/g, '');
      return name.includes(q) || (qd.length >= 3 && phone.includes(qd));
    }).slice(0, 12);
  }, [leads, studentQuery]);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !FINANCIAL_TX_COL) {
        setTransactions([]);
        return;
      }
      setTxLoading(true);
      try {
        const filters = [
          Query.equal('academyId', academyId),
          Query.limit(200),
          Query.orderDesc('$createdAt')
        ];
        if (fromDate) filters.push(Query.greaterThanEqual('$createdAt', new Date(fromDate).toISOString()));
        if (toDate) {
          const d = new Date(toDate);
          d.setDate(d.getDate() + 1);
          filters.push(Query.lessThan('$createdAt', d.toISOString()));
        }
        const res = await databases.listDocuments(DB_ID, FINANCIAL_TX_COL, filters);
        if (!active) return;
        const items = res.documents.map(d => ({
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
          note: d.note || ''
        }));
        setTransactions(items);
      } catch {
        if (active) setTransactions([]);
      } finally {
        if (active) setTxLoading(false);
      }
    };
    run();
    return () => { active = false; };
  }, [academyId, fromDate, toDate]);

  useEffect(() => {
    if (typeof onTransactionsChange === 'function') {
      onTransactionsChange(transactions);
    }
  }, [transactions, onTransactionsChange]);

  useEffect(() => {
    const onSettled = (e) => {
      const id = e?.detail?.id;
      if (!id) return;
      const nowIso = new Date().toISOString();
      setTransactions((prev) =>
        prev.map((t) => (String(t.id) === String(id) ? { ...t, status: 'settled', settledAt: nowIso } : t))
      );
    };
    window.addEventListener('navi-financial-tx-settled', onSettled);
    return () => window.removeEventListener('navi-financial-tx-settled', onSettled);
  }, []);

  const settle = async (id) => {
    try {
      await settleFinancialTransactionById(id);
      const nowIso = new Date().toISOString();
      const tx = transactions.find((t) => t.id === id);
      setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, status: 'settled', settledAt: nowIso } : t)));
      addToast({ type: 'success', message: 'Transação liquidada com sucesso' });
      if (tx && academyId) {
        applySettleAccountingSideEffects(tx, academyId);
      }
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    }
  };

  const saveManualTx = async () => {
    const grossNum =
      typeof txForm.gross === 'number' && Number.isFinite(txForm.gross)
        ? txForm.gross
        : parseCurrencyBRL(txForm.gross);
    if (!academyId || !FINANCIAL_TX_COL || !Number.isFinite(grossNum) || grossNum <= 0) {
      addToast({ type: 'error', message: 'Informe um valor bruto maior que zero.' });
      return;
    }
    const feeVal = txForm.fee
      ? grossNum * (parseFloat(String(txForm.fee).replace(',', '.')) / 100)
      : 0;
    const netVal = grossNum - feeVal;
    const installments = txForm.method === 'cartão_crédito' ? Math.min(12, Math.max(1, Number(txForm.installments) || 1)) : 1;
    setSavingTx(true);
    try {
      const doc = await databases.createDocument(DB_ID, FINANCIAL_TX_COL, ID.unique(), {
        academyId,
        saleId: '',
        lead_id: txForm.lead_id || '',
        method: txForm.method,
        installments,
        type: txForm.type,
        planName: txForm.planName || '',
        gross: grossNum,
        fee: feeVal,
        net: netVal,
        status: 'pending',
        note: txForm.note || '',
        settledAt: ''
      });
      const row = {
        id: doc.$id,
        saleId: doc.saleId || '',
        lead_id: doc.lead_id || txForm.lead_id || '',
        method: doc.method || txForm.method,
        installments: Number(doc.installments || installments),
        type: doc.type || txForm.type,
        planName: doc.planName || txForm.planName || '',
        gross: Number(doc.gross ?? grossNum),
        fee: Number(doc.fee ?? feeVal),
        net: Number(doc.net ?? netVal),
        status: doc.status || 'pending',
        createdAt: doc.$createdAt,
        settledAt: doc.settledAt || '',
        note: doc.note || txForm.note || ''
      };
      setTransactions((prev) => [row, ...prev]);
      setShowTxModal(false);
      setTxForm(initialTxForm());
      setStudentQuery('');
      setStudentPickerOpen(false);
      addToast({ type: 'success', message: 'Transação registrada.' });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingTx(false);
    }
  };

  return (
    <>
      <section className="mt-4 animate-in" style={{ animationDelay: '0.2s' }}>
        <h3 className="navi-section-heading mb-2">Lançamentos</h3>
        <div className="card">
          <div className="finance-tx-toolbar">
            <div className="flex gap-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ width: 180 }}>
                <label>De</label>
                <input className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="form-group" style={{ width: 180 }}>
                <label>Até</label>
                <input className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setTxForm(initialTxForm());
                setStudentQuery('');
                setStudentPickerOpen(false);
                setShowTxModal(true);
              }}
              style={{
                background: '#5B3FBF',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '10px 16px',
                fontWeight: 600,
                fontSize: 14,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              + Nova transação
            </button>
          </div>
          <div className="finance-table-wrap">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Venda</th>
                  <th>Aluno</th>
                  <th>Tipo</th>
                  <th>Método</th>
                  <th className="finance-num">Bruto</th>
                  <th className="finance-num">Taxa</th>
                  <th className="finance-num">Líquido</th>
                  <th>Status</th>
                  <th className="finance-num" style={{ width: 112 }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 12px' }}>Carregando...</td>
                  </tr>
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="finance-tx-empty">
                        <Receipt size={40} strokeWidth={1.5} style={{ opacity: 0.5, marginBottom: 4 }} aria-hidden />
                        <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 15 }}>Nenhuma transação encontrada</div>
                        <p>{`Use '+ Nova transação' para registrar um lançamento`}</p>
                      </div>
                    </td>
                  </tr>
                ) : transactions.map((tx) => {
                  const dt = new Date(tx.createdAt);
                  const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth()+1).padStart(2, '0')}/${dt.getFullYear()}`;
                  const grossFmt = (() => { try { return Number(tx.gross).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.gross); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
                  const feeFmt = (() => { try { return Number(tx.fee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.fee); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
                  const netFmt = (() => { try { return Number(tx.net).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.net); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
                  let typeLabel = '—';
                  if (tx.type === 'plan') typeLabel = `Plano${tx.planName ? ' • ' + tx.planName : ''}`;
                  else if (tx.type === 'product') typeLabel = 'Produto';
                  else if (tx.type === 'other') typeLabel = 'Outro';
                  else if (tx.type === 'expense') typeLabel = 'Despesa';
                  else if (tx.type) typeLabel = String(tx.type);
                  const creditLike = tx.method === 'credito' || tx.method === 'cartão_crédito';
                  const methodLabel = creditLike && tx.installments > 1 ? `${tx.method} ${tx.installments}x` : tx.method;
                  const rawName = tx.lead_id ? (leads.find((l) => l.id === tx.lead_id)?.name || '') : '';
                  const alumStr = rawName ? (rawName.length > 20 ? `${rawName.slice(0, 20)}…` : rawName) : '—';
                  const st = String(tx.status || '').toLowerCase();
                  const statusBadge = st === 'pending' ? (
                    <span className="badge badge-warning">Pendente</span>
                  ) : st === 'settled' ? (
                    <span className="badge badge-success">Liquidado</span>
                  ) : (
                    <span className="badge badge-secondary">{tx.status || '—'}</span>
                  );
                  return (
                    <tr key={tx.id}>
                      <td>{dateStr}</td>
                      <td>{tx.saleId || '-'}</td>
                      <td title={rawName || undefined}>{alumStr}</td>
                      <td>{typeLabel}</td>
                      <td>{methodLabel}</td>
                      <td className="finance-num">{grossFmt}</td>
                      <td className="finance-num">{feeFmt}</td>
                      <td className="finance-num">{netFmt}</td>
                      <td>{statusBadge}</td>
                      <td className="finance-num">
                        {tx.status !== 'settled' ? (
                          <button type="button" className="btn-outline" onClick={() => settle(tx.id)}>Liquidar</button>
                        ) : (
                          <span className="text-small" style={{ opacity: 0.75, color: 'var(--text-secondary)' }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {showTxModal && (
        <div
          className="navi-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-tx-modal-title"
          onClick={() => {
            if (!savingTx) setShowTxModal(false);
          }}
        >
          <div
            className="card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 20 }}
          >
            <h3 id="finance-tx-modal-title" className="navi-section-heading" style={{ marginBottom: 14 }}>Nova transação</h3>
            <div className="flex-col gap-3">
              <div className="form-group">
                <label>Tipo</label>
                <select
                  className="form-input"
                  value={txForm.type}
                  onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
                >
                  <option value="plan">Plano/Mensalidade</option>
                  <option value="product">Produto</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              {txForm.type === 'plan' && (
                <div className="form-group">
                  <label>Plano</label>
                  <select
                    className="form-input"
                    value={txForm.planName}
                    onChange={(e) => {
                      const name = e.target.value;
                      const pl = (financeConfig.plans || []).find((p) => (p.name || '') === name);
                      const price = pl != null ? Number(pl.price ?? 0) : NaN;
                      setTxForm({
                        ...txForm,
                        planName: name,
                        gross: name && Number.isFinite(price) && price >= 0 ? price : '',
                      });
                    }}
                  >
                    <option value="">Selecione…</option>
                    {(financeConfig.plans || []).filter((p) => String(p.name || '').trim()).map((p) => (
                      <option key={p.name} value={p.name}>{`${p.name} · R$ ${Number(p.price ?? 0).toFixed(2)}`}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group">
                <label>Valor (R$)</label>
                <input
                  className="form-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="0,00"
                  value={
                    txForm.gross === '' || txForm.gross === null || txForm.gross === undefined
                      ? ''
                      : maskCurrency(String(Math.round(Number(txForm.gross) * 100)))
                  }
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '');
                    if (!d) {
                      setTxForm((f) => ({ ...f, gross: '' }));
                      return;
                    }
                    const n = parseInt(d, 10) / 100;
                    setTxForm((f) => ({ ...f, gross: n }));
                  }}
                />
              </div>
              <div className="form-group">
                <label>Taxa (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0"
                  value={txForm.fee}
                  onChange={(e) => setTxForm({ ...txForm, fee: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Método</label>
                <select
                  className="form-input"
                  value={txForm.method}
                  onChange={(e) => {
                    const m = e.target.value;
                    setTxForm({ ...txForm, method: m, installments: m === 'cartão_crédito' ? (txForm.installments || 1) : 1 });
                  }}
                >
                  <option value="pix">PIX</option>
                  <option value="dinheiro">Dinheiro</option>
                  <option value="cartão_débito">Cartão débito</option>
                  <option value="cartão_crédito">Cartão crédito</option>
                  <option value="transferência">Transferência</option>
                </select>
              </div>
              {txForm.method === 'cartão_crédito' && (
                <div className="form-group">
                  <label>Parcelas</label>
                  <select
                    className="form-input"
                    value={String(txForm.installments || 1)}
                    onChange={(e) => setTxForm({ ...txForm, installments: Number(e.target.value) || 1 })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={String(n)}>{n}x</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="form-group" style={{ position: 'relative' }}>
                <label>Aluno (opcional)</label>
                <input
                  className="form-input"
                  placeholder="Buscar por nome..."
                  value={studentQuery}
                  onChange={(e) => {
                    setStudentQuery(e.target.value);
                    setStudentPickerOpen(true);
                    if (!e.target.value.trim()) setTxForm((f) => ({ ...f, lead_id: '' }));
                  }}
                  onFocus={() => setStudentPickerOpen(true)}
                  onBlur={() => { window.setTimeout(() => setStudentPickerOpen(false), 180); }}
                />
                {studentPickerOpen && studentMatches.length > 0 ? (
                  <div
                    className="card"
                    style={{
                      position: 'absolute',
                      zIndex: 2,
                      left: 0,
                      right: 0,
                      top: '100%',
                      marginTop: 4,
                      maxHeight: 220,
                      overflowY: 'auto',
                      padding: 0,
                      boxShadow: '0 8px 24px rgba(18,16,42,0.12)',
                    }}
                  >
                    {studentMatches.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        className="btn-ghost"
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          borderRadius: 0,
                          borderBottom: '0.5px solid var(--border-light)',
                          padding: '10px 12px',
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setTxForm((f) => ({ ...f, lead_id: l.id }));
                          setStudentQuery(String(l.name || ''));
                          setStudentPickerOpen(false);
                        }}
                      >
                        <div style={{ fontWeight: 600 }}>{l.name || '—'}</div>
                        <div className="text-small" style={{ color: 'var(--text-secondary)' }}>{l.phone || '—'}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="form-group">
                <label>Observação</label>
                <textarea
                  className="form-input"
                  rows={3}
                  value={txForm.note}
                  onChange={(e) => setTxForm({ ...txForm, note: e.target.value })}
                  placeholder="Opcional"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-3" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn-outline"
                disabled={savingTx}
                onClick={() => {
                  if (!savingTx) setShowTxModal(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={savingTx}
                onClick={() => void saveManualTx()}
                style={{ background: '#5B3FBF', color: '#fff', border: 'none' }}
              >
                {savingTx ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
