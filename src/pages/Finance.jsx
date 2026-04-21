import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL, FINANCIAL_TX_COL, FINANCE_TX_FN_ID, ACCOUNTS_COL, JOURNAL_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { Query, ID } from 'appwrite';
import { LEAD_STATUS } from '../lib/leadStatus';
import { Wallet2, CreditCard, Banknote, Trash2, PlusCircle, Receipt } from 'lucide-react';
import { callFunction } from '../lib/executeFunction';
import { useAccountingStore, seedAccounts } from '../store/useAccountingStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages';

const Finance = () => {
  const academyId = useLeadStore(s => s.academyId);
  const leads = useLeadStore((s) => s.leads);
  const addToast = useUiStore((s) => s.addToast);
  const [tab, setTab] = useState('transacoes'); // config | transacoes | plano | lancamentos | relatorios
  const [saving, setSaving] = useState(false);
  const [financeConfig, setFinanceConfig] = useState({
    cardFees: {
      pix: { percent: 0, fixed: 0 },
      debito: { percent: 0, fixed: 0 },
      credito_avista: { percent: 0, fixed: 0 },
      credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
    },
    bankAccounts: [],
    plans: []
  });
  const [academyName, setAcademyName] = useState('');
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
    if (!academyId) return;
    databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then(doc => {
        setAcademyName(doc.name || '');
        let cfg = null;
        try {
          cfg = doc.financeConfig ? (typeof doc.financeConfig === 'string' ? JSON.parse(doc.financeConfig) : doc.financeConfig) : null;
        } catch {
          cfg = null;
        }
        if (!cfg) {
          cfg = {
            cardFees: {
              pix: { percent: 0, fixed: 0 },
              debito: { percent: 0, fixed: 0 },
              credito_avista: { percent: 0, fixed: 0 },
              credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
            },
            bankAccounts: [],
            plans: []
          };
          if (typeof doc.debitPercentage !== 'undefined' || typeof doc.creditPercentage !== 'undefined' || typeof doc.creditInstallmentPercentage !== 'undefined') {
            const deb = Number(doc.debitPercentage ?? 0) || 0;
            const cre = Number(doc.creditPercentage ?? 0) || 0;
            const crePar = Number(doc.creditInstallmentPercentage ?? 0) || 0;
            const parcelasMap = {};
            for (let i = 2; i <= 12; i++) parcelasMap[String(i)] = crePar;
            cfg.cardFees = {
              pix: { percent: 0, fixed: 0 },
              debito: { percent: deb, fixed: 0 },
              credito_avista: { percent: cre, fixed: 0 },
              credito_parcelado: parcelasMap
            };
          }
        }
        setFinanceConfig(cfg);
      })
      .catch((e) => {
        console.error(e);
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      });
  }, [academyId]);

  const save = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        financeConfig: JSON.stringify(financeConfig || {})
      });
    } finally {
      setSaving(false);
    }
  };

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

  const settle = async (id) => {
    try {
      if (FINANCE_TX_FN_ID) {
        await callFunction(FINANCE_TX_FN_ID, { action: 'settle', id });
      } else if (FINANCIAL_TX_COL) {
        await databases.updateDocument(DB_ID, FINANCIAL_TX_COL, id, {
          status: 'settled',
          settledAt: new Date().toISOString()
        });
      } else {
        return;
      }
      const nowIso = new Date().toISOString();
      setTransactions((prev) => prev.map(t => t.id === id ? { ...t, status: 'settled', settledAt: nowIso } : t));
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    }
  };

  const saveManualTx = async () => {
    const grossNum = parseFloat(String(txForm.gross || '').replace(',', '.'));
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
    <div className="finance-page-root">
      <div className="finance-page-inner">
      <div className="animate-in">
        <h1 className="navi-page-title">Financeiro</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>Academia {academyName ? `• ${academyName}` : ''}</p>
      </div>

      <div className="finance-tabs" role="tablist" aria-label="Seções financeiras">
        <button type="button" role="tab" aria-selected={tab === 'config'} className={`finance-tab ${tab === 'config' ? 'finance-tab--active' : ''}`} onClick={() => setTab('config')}>Configurações</button>
        <button type="button" role="tab" aria-selected={tab === 'transacoes'} className={`finance-tab ${tab === 'transacoes' ? 'finance-tab--active' : ''}`} onClick={() => setTab('transacoes')}>Transações</button>
        <button type="button" role="tab" aria-selected={tab === 'plano'} className={`finance-tab ${tab === 'plano' ? 'finance-tab--active' : ''}`} onClick={() => setTab('plano')}>Plano de Contas</button>
        <button type="button" role="tab" aria-selected={tab === 'lancamentos'} className={`finance-tab ${tab === 'lancamentos' ? 'finance-tab--active' : ''}`} onClick={() => setTab('lancamentos')}>Lançamentos Contábeis</button>
        <button type="button" role="tab" aria-selected={tab === 'relatorios'} className={`finance-tab ${tab === 'relatorios' ? 'finance-tab--active' : ''}`} onClick={() => setTab('relatorios')}>Relatórios (DRE/DFC)</button>
      </div>

      {tab === 'config' && (
      <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
        <h3 className="navi-section-heading mb-2"><Banknote size={18} color="var(--v500)" /> Contas bancárias</h3>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.bankAccounts || []).map((acc, idx) => (
              <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Banco</label>
                  <input className="form-input" value={acc.bankName || ''} onChange={e => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), bankName: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label>Agência</label>
                  <input className="form-input" value={acc.branch || ''} onChange={e => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), branch: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 180 }}>
                  <label>Conta</label>
                  <input className="form-input" value={acc.account || ''} onChange={e => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), account: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Titular</label>
                  <input className="form-input" value={acc.accountName || ''} onChange={e => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), accountName: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Chave PIX</label>
                  <input className="form-input" value={acc.pixKey || ''} onChange={e => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), pixKey: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <button type="button" className="btn-ghost" title="Remover" onClick={() => {
                  const arr = [...(financeConfig.bankAccounts || [])];
                  arr.splice(idx, 1);
                  setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                }} style={{ alignSelf: 'center' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn-outline" onClick={() => {
                const arr = [...(financeConfig.bankAccounts || [])];
                arr.push({ bankName: '', branch: '', account: '', accountName: '', pixKey: '' });
                setFinanceConfig({ ...financeConfig, bankAccounts: arr });
              }}>Adicionar conta</button>
            </div>
          </div>
        </div>
      </section>
      )}

      {tab === 'config' && (
      <section className="mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
        <h3 className="navi-section-heading mb-2"><CreditCard size={18} color="var(--v500)" /> Taxas de cartão</h3>
        <div className="card">
          <div className="flex-col gap-4">
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}>
                <label>PIX (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.pix?.percent ?? 0} onChange={e => {
                  setFinanceConfig(prev => ({ ...prev, cardFees: { ...(prev.cardFees || {}), pix: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Débito (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.debito?.percent ?? 0} onChange={e => {
                  setFinanceConfig(prev => ({ ...prev, cardFees: { ...(prev.cardFees || {}), debito: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Crédito à vista (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.credito_avista?.percent ?? 0} onChange={e => {
                  setFinanceConfig(prev => ({ ...prev, cardFees: { ...(prev.cardFees || {}), credito_avista: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
            </div>
            <div>
              <span className="ctx-label" style={{ display: 'block', marginBottom: 8 }}>Crédito parcelado (%)</span>
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {[2,3,4,5,6,7,8,9,10,11,12].map(n => (
                  <div key={n} className="form-group" style={{ width: 96 }}>
                    <label style={{ fontSize: 12 }}>{n}x</label>
                    <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.credito_parcelado?.[String(n)] ?? 0} onChange={e => {
                      setFinanceConfig(prev => {
                        const mp = { ...((prev.cardFees || {}).credito_parcelado || {}) };
                        mp[String(n)] = Number(e.target.value || 0);
                        return { ...prev, cardFees: { ...(prev.cardFees || {}), credito_parcelado: mp } };
                      });
                    }} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {tab === 'config' && (
      <section className="mt-4 animate-in" style={{ animationDelay: '0.15s' }}>
        <h3 className="navi-section-heading mb-2"><Wallet2 size={18} color="var(--v500)" /> Planos</h3>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.plans || []).map((pl, idx) => (
              <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Nome</label>
                  <input className="form-input" value={pl.name || ''} onChange={e => {
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), name: e.target.value };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Preço (R$)</label>
                  <input className="form-input" type="number" step="0.01" min={0} value={pl.price ?? 0} onChange={e => {
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), price: Number(e.target.value || 0) };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label>Duração (dias)</label>
                  <input className="form-input" type="number" min={1} value={pl.durationDays ?? 30} onChange={e => {
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), durationDays: Number(e.target.value || 0) };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Descrição</label>
                  <input className="form-input" value={pl.description || ''} onChange={e => {
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), description: e.target.value };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 160 }}>
                  <label>Aplica taxa cartão</label>
                  <select className="form-input" value={pl.applyCardFee ? 'sim' : 'nao'} onChange={e => {
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), applyCardFee: e.target.value === 'sim' };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }}>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <button type="button" className="btn-ghost" title="Remover" onClick={() => {
                  const arr = [...(financeConfig.plans || [])];
                  arr.splice(idx, 1);
                  setFinanceConfig({ ...financeConfig, plans: arr });
                }} style={{ alignSelf: 'center' }}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div>
              <button type="button" className="btn-outline" onClick={() => {
                const arr = [...(financeConfig.plans || [])];
                arr.push({ name: '', price: 0, durationDays: 30, description: '', applyCardFee: true });
                setFinanceConfig({ ...financeConfig, plans: arr });
              }}>Adicionar plano</button>
            </div>
          </div>
        </div>
      </section>
      )}

      {tab === 'transacoes' && (
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
      )}

      {showTxModal && (
        <div
          className="navi-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finance-tx-modal-title"
          onClick={() => (savingTx ? undefined : setShowTxModal(false))}
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
                      const price = pl != null ? Number(pl.price ?? 0) : '';
                      setTxForm({ ...txForm, planName: name, gross: price === '' ? '' : String(price) });
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
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0,00"
                  value={txForm.gross}
                  onChange={(e) => setTxForm({ ...txForm, gross: e.target.value })}
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
                onClick={() => (savingTx ? undefined : setShowTxModal(false))}
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

      {tab === 'config' && (
      <div className="flex gap-2 mt-4">
        <button className="btn-secondary" onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
      </div>
      )}

      {tab === 'plano' && <AccountsTab />}
      {tab === 'lancamentos' && <JournalTab />}
      {tab === 'relatorios' && <ReportsTab />}
      </div>
      <style dangerouslySetInnerHTML={{
        __html: `
          .finance-page-root { width: 100%; box-sizing: border-box; }
          .finance-page-inner { max-width: 1100px; margin: 0 auto; padding: 24px; box-sizing: border-box; padding-bottom: 40px; }
          .finance-tabs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; margin-bottom: 6px; }
          .finance-tab { border: none; border-radius: 8px; padding: 8px 14px; font-size: 12px; font-weight: 600; cursor: pointer; background: transparent; color: var(--text-secondary); font-family: inherit; transition: background 0.15s ease, color 0.15s ease; }
          .finance-tab--active { background: #5B3FBF; color: #fff; }
          .finance-tx-toolbar { display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; }
          .finance-table-wrap { width: 100%; overflow-x: auto; border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); background: var(--surface); }
          .finance-table { width: 100%; border-collapse: collapse; font-size: 13px; }
          .finance-table thead th { text-align: left; padding: 10px 12px; background: var(--surface-hover); border-bottom: 1px solid var(--border-light); font-weight: 600; color: var(--mid); white-space: nowrap; }
          .finance-table thead th.finance-num { text-align: right; }
          .finance-table td { padding: 10px 12px; border-bottom: 0.5px solid var(--border-light); vertical-align: middle; }
          .finance-table tbody tr:hover { background: var(--surface-hover); }
          .finance-table .finance-num { text-align: right; font-variant-numeric: tabular-nums; }
          .finance-tx-empty { padding: 56px 20px; text-align: center; color: var(--text-secondary); }
          .finance-tx-empty p { margin: 8px 0 0; font-size: 13px; }
          .finance-accounts-form-card { background: var(--surface-hover); border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 20px; }
          .finance-accounts-form-grid { display: grid; grid-template-columns: 120px 1fr; gap: 10px; align-items: end; }
          @media (min-width: 720px) {
            .finance-accounts-form-grid--row2 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
            .finance-accounts-form-grid--row3 { grid-template-columns: 1fr 160px auto; align-items: end; }
          }
          @media (max-width: 719px) {
            .finance-accounts-form-grid { grid-template-columns: 1fr 1fr; }
            .finance-accounts-form-grid--row2, .finance-accounts-form-grid--row3 { grid-template-columns: 1fr 1fr; }
          }
          .finance-accounts-row .finance-accounts-delete { opacity: 0.35; transition: opacity 0.15s ease; }
          .finance-accounts-row:hover .finance-accounts-delete { opacity: 1; }
          .finance-reports-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 20px; }
          .finance-reports-block { background: var(--surface); border: 0.5px solid var(--border-violet); border-radius: var(--radius-sm); padding: 20px; margin-bottom: 16px; }
          .finance-reports-block h4 { font-size: 15px; font-weight: 500; margin: 0 0 14px; color: var(--ink); }
          .finance-reports-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 0.5px solid var(--border-light); gap: 12px; }
          .finance-reports-row:last-child { border-bottom: none; }
          .finance-reports-row--total { font-weight: 600; background: var(--surface-hover); padding: 8px 10px; border-radius: var(--radius-sm); margin-top: 4px; border-bottom: none; }
        `
      }} />
    </div>
  );
};

export default Finance;

// ====================== CONTÁBIL (reaproveitado) ======================
const fmt = (n) => {
  try { return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  catch { const v = Number(n || 0); return `R$ ${v.toFixed(2)}`.replace('.', ','); }
};

const AccountsTab = () => {
  const academyId = useLeadStore((s) => s.academyId);
  const accounts = useAccountingStore((s) => s.accounts);
  const addAccount = useAccountingStore((s) => s.addAccount);
  const updateAccount = useAccountingStore((s) => s.updateAccount);
  const deleteAccount = useAccountingStore((s) => s.deleteAccount);
  const setAccounts = useAccountingStore((s) => s.setAccounts);
  const [draft, setDraft] = useState({ code: '', name: '', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: '', dfcSubclasse: '', cash: false });
  const sortedAccounts = useMemo(() => {
    const copy = Array.isArray(accounts) ? [...accounts] : [];
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return copy;
  }, [accounts]);
  useEffect(() => {
    let active = true;
    const mapDoc = (d) => ({
      id: d.$id,
      code: d.code || '',
      name: d.name || '',
      type: d.type || 'ativo',
      nature: d.nature || 'devedora',
      dreGrupo: d.dreGrupo || '',
      dfcClasse: d.dfcClasse || '',
      dfcSubclasse: d.dfcSubclasse || '',
      cash: Boolean(d.cash),
    });
    const run = async () => {
      if (!academyId || !ACCOUNTS_COL) return;
      try {
        const res = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderAsc('code')
        ]);
        if (!active) return;
        const docs = res.documents || [];
        if (docs.length === 0) {
          const seeds = seedAccounts();
          const payloads = seeds.map((s) => ({
            academyId,
            code: s.code,
            name: s.name,
            type: s.type,
            nature: s.nature,
            dreGrupo: s.dreGrupo || '',
            dfcClasse: s.dfcClasse || '',
            dfcSubclasse: s.dfcSubclasse || '',
            cash: Boolean(s.cash),
          }));
          const results = await Promise.allSettled(
            payloads.map((payload) =>
              databases.createDocument(DB_ID, ACCOUNTS_COL, ID.unique(), payload)
            )
          );
          const created = results
            .filter((r) => r.status === 'fulfilled')
            .map((r) => mapDoc(r.value));
          if (!active) return;
          if (created.length > 0) {
            setAccounts(created);
          } else {
            seeds.forEach((s) => {
              addAccount({
                code: s.code,
                name: s.name,
                type: s.type,
                nature: s.nature,
                dreGrupo: s.dreGrupo || '',
                dfcClasse: s.dfcClasse || '',
                dfcSubclasse: s.dfcSubclasse || '',
                cash: Boolean(s.cash),
              });
            });
          }
        } else {
          if (active) setAccounts(docs.map(mapDoc));
        }
      } catch (e) { const _ = e; }
    };
    run();
    return () => { active = false; };
  }, [academyId, setAccounts, addAccount]);
  const onAdd = () => {
    if (!draft.code || !draft.name) return;
    if (academyId && ACCOUNTS_COL) {
      databases.createDocument(DB_ID, ACCOUNTS_COL, 'unique()', {
        academyId,
        code: draft.code,
        name: draft.name,
        type: draft.type,
        nature: draft.nature,
        dreGrupo: draft.dreGrupo || '',
        dfcClasse: draft.dfcClasse || '',
        dfcSubclasse: draft.dfcSubclasse || '',
        cash: Boolean(draft.cash),
      }).then((doc) => {
        addAccount({ ...draft, id: doc.$id });
      }).catch(() => {
        addAccount(draft);
      });
    } else {
      addAccount(draft);
    }
    setDraft({ code: '', name: '', type: 'ativo', nature: 'devedora', dreGrupo: '', dfcClasse: '', dfcSubclasse: '', cash: false });
  };
  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Plano de Contas</h3>
      <div className="finance-accounts-form-card">
        <div className="ctx-label" style={{ marginBottom: 10 }}>Nova conta</div>
        <div className="finance-accounts-form-grid">
          <div className="form-group">
            <label>Código</label>
            <input className="form-input" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="1.1.1" />
          </div>
          <div className="form-group">
            <label>Nome</label>
            <input className="form-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
        </div>
        <div className="finance-accounts-form-grid finance-accounts-form-grid--row2 mt-2">
          <div className="form-group">
            <label>Tipo</label>
            <select className="form-input" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}>
              <option value="ativo">Ativo</option>
              <option value="passivo">Passivo</option>
              <option value="pl">PL</option>
              <option value="receita">Receita</option>
              <option value="custo">Custo</option>
              <option value="despesa">Despesa</option>
            </select>
          </div>
          <div className="form-group">
            <label>Natureza</label>
            <select className="form-input" value={draft.nature} onChange={(e) => setDraft({ ...draft, nature: e.target.value })}>
              <option value="devedora">Devedora</option>
              <option value="credora">Credora</option>
            </select>
          </div>
          <div className="form-group">
            <label>Grupo DRE</label>
            <input className="form-input" value={draft.dreGrupo} onChange={(e) => setDraft({ ...draft, dreGrupo: e.target.value })} placeholder="Receita Bruta, Deduções…" />
          </div>
          <div className="form-group">
            <label>Classe DFC</label>
            <select className="form-input" value={draft.dfcClasse} onChange={(e) => setDraft({ ...draft, dfcClasse: e.target.value })}>
              <option value="">—</option>
              <option value="Operacional">Operacional</option>
              <option value="Investimento">Investimento</option>
              <option value="Financiamento">Financiamento</option>
              <option value="Caixa">Caixa</option>
            </select>
          </div>
        </div>
        <div className="finance-accounts-form-grid finance-accounts-form-grid--row3 mt-2">
          <div className="form-group">
            <label>Subclasse DFC</label>
            <input className="form-input" value={draft.dfcSubclasse} onChange={(e) => setDraft({ ...draft, dfcSubclasse: e.target.value })} placeholder="clientes, fornecedores…" />
          </div>
          <div className="form-group">
            <label>Afeta Caixa</label>
            <select className="form-input" value={draft.cash ? 'sim' : 'nao'} onChange={(e) => setDraft({ ...draft, cash: e.target.value === 'sim' })}>
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <div className="form-group" style={{ justifyContent: 'flex-end' }}>
            <label style={{ visibility: 'hidden' }} aria-hidden>Adicionar</label>
            <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={onAdd}><PlusCircle size={18} /> Adicionar</button>
          </div>
        </div>
      </div>
      <div className="finance-table-wrap mt-3">
        <table className="finance-table">
          <thead>
            <tr>
              <th style={{ minWidth: 100 }}>Código</th>
              <th style={{ minWidth: 140 }}>Nome</th>
              <th>Tipo</th>
              <th>Natureza</th>
              <th>DRE</th>
              <th>DFC</th>
              <th style={{ textAlign: 'center', width: 72 }}>Caixa</th>
              <th className="finance-num" style={{ width: 56 }} aria-label="Excluir" />
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.map((a) => (
              <tr key={a.id} className="finance-accounts-row">
                <td>
                  <input className="form-input" value={a.code} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { code: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { code: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <input className="form-input" value={a.name} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { name: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { name: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <select className="form-input" value={a.type} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { type: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { type: val }).catch(() => {});
                  }}>
                    <option value="ativo">Ativo</option>
                    <option value="passivo">Passivo</option>
                    <option value="pl">PL</option>
                    <option value="receita">Receita</option>
                    <option value="custo">Custo</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </td>
                <td>
                  <select className="form-input" value={a.nature} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { nature: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { nature: val }).catch(() => {});
                  }}>
                    <option value="devedora">Devedora</option>
                    <option value="credora">Credora</option>
                  </select>
                </td>
                <td>
                  <input className="form-input" value={a.dreGrupo || ''} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { dreGrupo: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { dreGrupo: val }).catch(() => {});
                  }} />
                </td>
                <td>
                  <select className="form-input" value={a.dfcClasse || ''} onChange={(e) => {
                    const val = e.target.value;
                    updateAccount(a.id, { dfcClasse: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { dfcClasse: val }).catch(() => {});
                  }}>
                    <option value="">—</option>
                    <option value="Operacional">Operacional</option>
                    <option value="Investimento">Investimento</option>
                    <option value="Financiamento">Financiamento</option>
                    <option value="Caixa">Caixa</option>
                  </select>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <input type="checkbox" checked={!!a.cash} onChange={(e) => {
                    const val = e.target.checked;
                    updateAccount(a.id, { cash: val });
                    if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { cash: val }).catch(() => {});
                  }} />
                </td>
                <td className="finance-num">
                  <button
                    type="button"
                    className="btn-ghost finance-accounts-delete"
                    title="Remover conta"
                    onClick={() => {
                      const id = a.id;
                      if (academyId && ACCOUNTS_COL) databases.deleteDocument(DB_ID, ACCOUNTS_COL, id).catch(() => {});
                      deleteAccount(id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

const JournalTab = () => {
  const academyId = useLeadStore((s) => s.academyId);
  const accounts = useAccountingStore((s) => s.accounts);
  const addEntry = useAccountingStore((s) => s.addEntry);
  const journal = useAccountingStore((s) => s.journal);
  const deleteEntry = useAccountingStore((s) => s.deleteEntry);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const [date, setDate] = useState('');
  const [memo, setMemo] = useState('');
  const [lines, setLines] = useState([{ accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  const sortedAccounts = useMemo(() => {
    const copy = Array.isArray(accounts) ? [...accounts] : [];
    copy.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
    return copy;
  }, [accounts]);
  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!academyId || !JOURNAL_COL) return;
      try {
        const res = await databases.listDocuments(DB_ID, JOURNAL_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderDesc('date'),
        ]);
        if (!active) return;
        const list = res.documents.map((d) => ({
          id: d.$id,
          date: d.date,
          memo: d.memo || '',
          lines: (() => { try { return JSON.parse(d.lines || '[]'); } catch { return []; } })(),
        }));
        setJournal(list);
      } catch (e) { const _ = e; }
    };
    run();
    return () => { active = false; };
  }, [academyId, setJournal]);
  const totalD = lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const balanced = Number(totalD.toFixed(2)) === Number(totalC.toFixed(2)) && totalD > 0;
  const addLine = () => setLines([...lines, { accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  const removeLine = (idx) => setLines(lines.filter((_, i) => i !== idx));
  const submit = () => {
    if (!date || !balanced) return;
    const payload = { date, memo, lines: lines.map((l) => ({ ...l, debit: Number(l.debit || 0), credit: Number(l.credit || 0) })) };
    if (academyId && JOURNAL_COL) {
      databases.createDocument(DB_ID, JOURNAL_COL, 'unique()', {
        academyId,
        date,
        memo: memo || '',
        lines: JSON.stringify(payload.lines),
      }).then((doc) => {
        addEntry({ ...payload, id: doc.$id });
      }).catch(() => {
        addEntry(payload);
      });
    } else {
      addEntry(payload);
    }
    setDate('');
    setMemo('');
    setLines([{ accountId: '', debit: '', credit: '', cash: false, counterCode: '' }]);
  };
  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Lançamentos Contábeis</h3>
      <div className="card">
        <div className="flex gap-2">
          <div className="form-group" style={{ width: 180 }}>
            <label>Data</label>
            <input className="form-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Histórico</label>
            <input className="form-input" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Descrição" />
          </div>
        </div>
        <div className="mt-2">
          {lines.map((l, idx) => (
            <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label>Conta</label>
                <select className="form-input" value={l.accountId} onChange={(e) => {
                  const arr = [...lines];
                  arr[idx] = { ...arr[idx], accountId: e.target.value };
                  setLines(arr);
                }}>
                  <option value="">Selecione...</option>
                  {sortedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} • {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ width: 140 }}>
                <label>Débito</label>
                <input className="form-input" type="number" step="0.01" value={l.debit} onChange={(e) => {
                  const arr = [...lines];
                  arr[idx] = { ...arr[idx], debit: e.target.value, credit: '' };
                  setLines(arr);
                }} />
              </div>
              <div className="form-group" style={{ width: 140 }}>
                <label>Crédito</label>
                <input className="form-input" type="number" step="0.01" value={l.credit} onChange={(e) => {
                  const arr = [...lines];
                  arr[idx] = { ...arr[idx], credit: e.target.value, debit: '' };
                  setLines(arr);
                }} />
              </div>
              <div className="form-group" style={{ width: 160 }}>
                <label>Afeta Caixa</label>
                <select className="form-input" value={l.cash ? 'sim' : 'nao'} onChange={(e) => {
                  const arr = [...lines];
                  arr[idx] = { ...arr[idx], cash: e.target.value === 'sim' };
                  setLines(arr);
                }}>
                  <option value="nao">Não</option>
                  <option value="sim">Sim</option>
                </select>
              </div>
              <div className="form-group" style={{ width: 180 }}>
                <label>Contrapartida (prefixo)</label>
                <input className="form-input" placeholder="ex.: 4.* ou 2.1.*" value={l.counterCode} onChange={(e) => {
                  const arr = [...lines];
                  arr[idx] = { ...arr[idx], counterCode: e.target.value };
                  setLines(arr);
                }} />
              </div>
              <button className="btn-outline" onClick={() => removeLine(idx)}><Trash2 size={16} /></button>
            </div>
          ))}
          <button className="btn-outline" onClick={addLine}><PlusCircle size={18} />Adicionar linha</button>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="badge badge-secondary">Débitos: {fmt(totalD)}</div>
          <div className="badge badge-secondary">Créditos: {fmt(totalC)}</div>
          <div className="badge" style={{ background: balanced ? 'var(--success-light)' : 'var(--danger-light)', color: balanced ? 'var(--success)' : 'var(--danger)' }}>
            {balanced ? 'Lançamento balanceado' : 'Lançamento não balanceado'}
          </div>
        </div>
        <div className="mt-3">
          <button className="btn-secondary" disabled={!balanced || !date} onClick={submit}>Lançar</button>
        </div>
        <div className="table mt-3">
          <div className="row header">
            <div style={{ width: 110 }}>Data</div>
            <div style={{ flex: 1 }}>Histórico</div>
            <div style={{ width: 120, textAlign: 'right' }}>Débitos</div>
            <div style={{ width: 120, textAlign: 'right' }}>Créditos</div>
            <div style={{ width: 80 }}></div>
          </div>
          {journal.length === 0 ? (
            <div className="empty-state">Nenhum lançamento</div>
          ) : journal.map((e) => {
            const d = new Date(e.date);
            const dd = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
            const sd = e.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
            const sc = e.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
            return (
              <div className="row" key={e.id}>
                <div style={{ width: 110 }}>{dd}</div>
                <div style={{ flex: 1 }}>{e.memo || '-'}</div>
                <div style={{ width: 120, textAlign: 'right' }}>{fmt(sd)}</div>
                <div style={{ width: 120, textAlign: 'right' }}>{fmt(sc)}</div>
                <div style={{ width: 80, textAlign: 'right' }}>
                  <button className="btn-outline" onClick={() => {
                    if (academyId && JOURNAL_COL) databases.deleteDocument(DB_ID, JOURNAL_COL, e.id).catch(() => {});
                    deleteEntry(e.id);
                  }}><Trash2 size={16} /></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

const ReportsTab = () => {
  const dre = useAccountingStore((s) => s.dre);
  const dfcIndireto = useAccountingStore((s) => s.dfcIndireto);
  const dfcDireto = useAccountingStore((s) => s.dfcDireto);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [method, setMethod] = useState('indireto');
  const dreData = useMemo(() => dre(from, to), [from, to, dre]);
  const dfcData = useMemo(() => (method === 'indireto' ? dfcIndireto(from, to) : dfcDireto(from, to)), [method, from, to, dfcIndireto, dfcDireto]);
  const dreTotals = new Set(['Receita Líquida', 'Lucro Bruto', 'Resultado Operacional', 'Resultado Líquido']);
  const dreRows = [
    ['Receita Bruta', dreData['Receita Bruta'] || 0],
    ['Deduções', -(Math.abs(dreData['Deduções'] || 0))],
    ['Receita Líquida', dreData['Receita Líquida'] || 0],
    ['CMV/CPV', -(Math.abs(dreData['CMV/CPV'] || 0))],
    ['Lucro Bruto', dreData['Lucro Bruto'] || 0],
    ['Despesas Operacionais', -(Math.abs(dreData['Despesas Operacionais'] || 0))],
    ['Resultado Financeiro', (dreData['Resultado Financeiro'] || 0)],
    ['Resultado Operacional', dreData['Resultado Operacional'] || 0],
    ['Imposto s/ Lucro', -(Math.abs(dreData['Imposto s/ Lucro'] || 0))],
    ['Resultado Líquido', dreData['Resultado Líquido'] || 0],
  ];
  const variacaoCaixa = (dfcData.operacional || 0) + (dfcData.investimento || 0) + (dfcData.financiamento || 0);
  const dfcRows = [
    ['Operacional', dfcData.operacional || 0],
    ['Investimento', dfcData.investimento || 0],
    ['Financiamento', dfcData.financiamento || 0],
    ['Variação de Caixa', variacaoCaixa],
  ];
  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Relatórios</h3>
      <div className="finance-reports-filters">
        <div className="form-group" style={{ width: 180 }}>
          <label>De</label>
          <input className="form-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="form-group" style={{ width: 180 }}>
          <label>Até</label>
          <input className="form-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="form-group" style={{ width: 200 }}>
          <label>Método DFC</label>
          <select className="form-input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="indireto">Indireto</option>
            <option value="direto">Direto</option>
          </select>
        </div>
      </div>
      <div className="finance-reports-block">
        <h4>Demonstração do Resultado (DRE)</h4>
        <div>
          {dreRows.map(([k, v]) => (
            <div key={k} className={`finance-reports-row${dreTotals.has(k) ? ' finance-reports-row--total' : ''}`}>
              <span>{k}</span>
              <span style={{ fontWeight: dreTotals.has(k) ? 600 : 500 }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="finance-reports-block">
        <h4>Demonstração do Fluxo de Caixa (DFC)</h4>
        <div>
          {dfcRows.map(([k, v], idx) => (
            <div
              key={k}
              className={`finance-reports-row${idx === dfcRows.length - 1 ? ' finance-reports-row--total' : ''}`}
            >
              <span>{k}</span>
              <span style={{ fontWeight: idx === dfcRows.length - 1 ? 600 : 500 }}>{fmt(v)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
