import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL, FINANCIAL_TX_COL, FINANCE_TX_FN_ID, ACCOUNTS_COL, JOURNAL_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { Query } from 'appwrite';
import { Wallet2, CreditCard, Banknote, Trash2, PlusCircle } from 'lucide-react';
import { callFunction } from '../lib/executeFunction';
import { useAccountingStore } from '../store/useAccountingStore';

const Finance = () => {
  const academyId = useLeadStore(s => s.academyId);
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
      .catch((e) => { console.error(e); });
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
          method: d.method || '',
          installments: Number(d.installments || 1),
          type: d.type || '',
          planName: d.planName || '',
          gross: Number(d.gross || 0),
          fee: Number(d.fee || 0),
          net: Number(d.net || 0),
          status: d.status || 'pending',
          createdAt: d.$createdAt,
          settledAt: d.settledAt || ''
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
      }
      setTransactions((prev) => prev.map(t => t.id === id ? { ...t, status: 'settled', settledAt: new Date().toISOString() } : t));
    } catch (e) { console.error(e); }
  };

  return (
    <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
      <div className="animate-in">
        <h1 style={{ fontSize: '1.5rem', marginBottom: 2 }}>Financeiro</h1>
        <p className="text-small">Academia {academyName ? `• ${academyName}` : ''}</p>
      </div>

      <div className="mt-3" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className={tab === 'config' ? 'btn-secondary' : 'btn-outline'} onClick={() => setTab('config')}>Configurações</button>
        <button className={tab === 'transacoes' ? 'btn-secondary' : 'btn-outline'} onClick={() => setTab('transacoes')}>Transações</button>
        <button className={tab === 'plano' ? 'btn-secondary' : 'btn-outline'} onClick={() => setTab('plano')}>Plano de Contas</button>
        <button className={tab === 'lancamentos' ? 'btn-secondary' : 'btn-outline'} onClick={() => setTab('lancamentos')}>Lançamentos Contábeis</button>
        <button className={tab === 'relatorios' ? 'btn-secondary' : 'btn-outline'} onClick={() => setTab('relatorios')}>Relatórios (DRE/DFC)</button>
      </div>

      {tab === 'config' && (
      <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
        <h3 className="mb-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Banknote size={18} /> Contas bancárias</h3>
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
        <h3 className="mb-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CreditCard size={18} /> Taxas de cartão</h3>
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
              <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>Crédito parcelado (%)</label>
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
        <h3 className="mb-2" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Wallet2 size={18} /> Planos</h3>
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
        <h3 className="mb-2">Lançamentos</h3>
        <div className="card">
          <div className="flex gap-2">
            <div className="form-group" style={{ width: 180 }}>
              <label>De</label>
              <input className="form-input" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ width: 180 }}>
              <label>Até</label>
              <input className="form-input" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="table" style={{ marginTop: 10 }}>
            <div className="row header">
              <div style={{ flex: 2 }}>Data</div>
              <div style={{ flex: 2 }}>Venda</div>
              <div style={{ flex: 2 }}>Tipo</div>
              <div style={{ flex: 2 }}>Método</div>
              <div style={{ flex: 1, textAlign: 'right' }}>Bruto</div>
              <div style={{ flex: 1, textAlign: 'right' }}>Taxa</div>
              <div style={{ flex: 1, textAlign: 'right' }}>Líquido</div>
              <div style={{ flex: 1 }}>Status</div>
              <div style={{ width: 120 }}></div>
            </div>
            {txLoading ? (
              <div className="row"><div>Carregando...</div></div>
            ) : transactions.length === 0 ? (
              <div className="row"><div>Nenhum lançamento</div></div>
            ) : transactions.map(tx => {
              const dt = new Date(tx.createdAt);
              const dateStr = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth()+1).padStart(2, '0')}/${dt.getFullYear()}`;
              const grossFmt = (() => { try { return Number(tx.gross).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.gross); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
              const feeFmt = (() => { try { return Number(tx.fee).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.fee); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
              const netFmt = (() => { try { return Number(tx.net).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); } catch { const n = Number(tx.net); return `R$ ${n.toFixed(2)}`.replace('.', ','); } })();
              const typeLabel = tx.type === 'plan' ? `Plano${tx.planName ? ' • ' + tx.planName : ''}` : 'Produto';
              const methodLabel = tx.method === 'credito' && tx.installments > 1 ? `${tx.method} ${tx.installments}x` : tx.method;
              return (
                <div className="row" key={tx.id}>
                  <div style={{ flex: 2 }}>{dateStr}</div>
                  <div style={{ flex: 2 }}>{tx.saleId || '-'}</div>
                  <div style={{ flex: 2 }}>{typeLabel}</div>
                  <div style={{ flex: 2 }}>{methodLabel}</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>{grossFmt}</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>{feeFmt}</div>
                  <div style={{ flex: 1, textAlign: 'right' }}>{netFmt}</div>
                  <div style={{ flex: 1 }}>{tx.status}</div>
                  <div style={{ width: 120, textAlign: 'right' }}>
                    {tx.status !== 'settled' ? (
                      <button type="button" className="btn-outline" onClick={() => settle(tx.id)}>Liquidar</button>
                    ) : (
                      <span className="text-small" style={{ opacity: 0.8 }}>Liquidado</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
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
    const run = async () => {
      if (!academyId || !ACCOUNTS_COL) return;
      try {
        const res = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderAsc('code')
        ]);
        if (!active) return;
        const list = res.documents.map((d) => ({
          id: d.$id,
          code: d.code || '',
          name: d.name || '',
          type: d.type || 'ativo',
          nature: d.nature || 'devedora',
          dreGrupo: d.dreGrupo || '',
          dfcClasse: d.dfcClasse || '',
          dfcSubclasse: d.dfcSubclasse || '',
          cash: Boolean(d.cash),
        }));
        setAccounts(list);
      } catch (e) { const _ = e; }
    };
    run();
    return () => { active = false; };
  }, [academyId, setAccounts]);
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
      <h3 className="mb-2">Plano de Contas</h3>
      <div className="card">
        <div className="flex gap-2">
          <div className="form-group" style={{ width: 120 }}>
            <label>Código</label>
            <input className="form-input" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="1.1.1" />
          </div>
          <div className="form-group" style={{ flex: 2 }}>
            <label>Nome</label>
            <input className="form-input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="form-group" style={{ width: 140 }}>
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
          <div className="form-group" style={{ width: 140 }}>
            <label>Natureza</label>
            <select className="form-input" value={draft.nature} onChange={(e) => setDraft({ ...draft, nature: e.target.value })}>
              <option value="devedora">Devedora</option>
              <option value="credora">Credora</option>
            </select>
          </div>
        </div>
        <div className="flex gap-2 mt-2">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Grupo DRE</label>
            <input className="form-input" value={draft.dreGrupo} onChange={(e) => setDraft({ ...draft, dreGrupo: e.target.value })} placeholder="Receita Bruta, Deduções, CMV/CPV..." />
          </div>
          <div className="form-group" style={{ width: 160 }}>
            <label>Classe DFC</label>
            <select className="form-input" value={draft.dfcClasse} onChange={(e) => setDraft({ ...draft, dfcClasse: e.target.value })}>
              <option value="">—</option>
              <option value="Operacional">Operacional</option>
              <option value="Investimento">Investimento</option>
              <option value="Financiamento">Financiamento</option>
              <option value="Caixa">Caixa</option>
            </select>
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Subclasse DFC</label>
            <input className="form-input" value={draft.dfcSubclasse} onChange={(e) => setDraft({ ...draft, dfcSubclasse: e.target.value })} placeholder="clientes, fornecedores, juros, capex..." />
          </div>
          <div className="form-group" style={{ width: 160 }}>
            <label>Afeta Caixa</label>
            <select className="form-input" value={draft.cash ? 'sim' : 'nao'} onChange={(e) => setDraft({ ...draft, cash: e.target.value === 'sim' })}>
              <option value="nao">Não</option>
              <option value="sim">Sim</option>
            </select>
          </div>
          <button className="btn-secondary" onClick={onAdd}><PlusCircle size={18} />Adicionar</button>
        </div>
        <div className="table mt-3">
          <div className="row header">
            <div style={{ width: 110 }}>Código</div>
            <div style={{ flex: 2 }}>Nome</div>
            <div style={{ width: 120 }}>Tipo</div>
            <div style={{ width: 120 }}>Natureza</div>
            <div style={{ flex: 1 }}>DRE</div>
            <div style={{ width: 140 }}>DFC</div>
            <div style={{ width: 80, textAlign: 'center' }}>Caixa</div>
            <div style={{ width: 80 }}></div>
          </div>
          {sortedAccounts.map((a) => (
            <div key={a.id} className="row" style={{ alignItems: 'center' }}>
              <div style={{ width: 110 }}>
              <input className="form-input" value={a.code} onChange={(e) => {
                const val = e.target.value;
                updateAccount(a.id, { code: val });
                if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { code: val }).catch(() => {});
              }} />
              </div>
              <div style={{ flex: 2 }}>
              <input className="form-input" value={a.name} onChange={(e) => {
                const val = e.target.value;
                updateAccount(a.id, { name: val });
                if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { name: val }).catch(() => {});
              }} />
              </div>
              <div style={{ width: 120 }}>
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
              </div>
              <div style={{ width: 120 }}>
              <select className="form-input" value={a.nature} onChange={(e) => {
                const val = e.target.value;
                updateAccount(a.id, { nature: val });
                if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { nature: val }).catch(() => {});
              }}>
                  <option value="devedora">Devedora</option>
                  <option value="credora">Credora</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
              <input className="form-input" value={a.dreGrupo || ''} onChange={(e) => {
                const val = e.target.value;
                updateAccount(a.id, { dreGrupo: val });
                if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { dreGrupo: val }).catch(() => {});
              }} />
              </div>
              <div style={{ width: 140 }}>
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
              </div>
              <div style={{ width: 80, textAlign: 'center' }}>
              <input type="checkbox" checked={!!a.cash} onChange={(e) => {
                const val = e.target.checked;
                updateAccount(a.id, { cash: val });
                if (academyId && ACCOUNTS_COL) databases.updateDocument(DB_ID, ACCOUNTS_COL, a.id, { cash: val }).catch(() => {});
              }} />
              </div>
              <div style={{ width: 80, textAlign: 'right' }}>
              <button className="btn-outline" onClick={() => {
                const id = a.id;
                if (academyId && ACCOUNTS_COL) databases.deleteDocument(DB_ID, ACCOUNTS_COL, id).catch(() => {});
                deleteAccount(id);
              }}><Trash2 size={16} /></button>
              </div>
            </div>
          ))}
        </div>
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
      <h3 className="mb-2">Lançamentos Contábeis</h3>
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
  return (
    <section className="mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="mb-2">Relatórios</h3>
      <div className="card">
        <div className="flex gap-2">
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
      </div>
      <section className="card mt-3">
        <h3 className="mb-2">Demonstração do Resultado (DRE)</h3>
        <div className="table">
          {[
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
          ].map(([k, v]) => (
            <div key={k} className="row">
              <div style={{ flex: 1 }}>{k}</div>
              <div style={{ width: 160, textAlign: 'right' }}>{fmt(v)}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="card mt-3">
        <h3 className="mb-2">Demonstração do Fluxo de Caixa (DFC)</h3>
        <div className="table">
          <div className="row">
            <div style={{ flex: 1 }}>Operacional</div>
            <div style={{ width: 160, textAlign: 'right' }}>{fmt(dfcData.operacional || 0)}</div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>Investimento</div>
            <div style={{ width: 160, textAlign: 'right' }}>{fmt(dfcData.investimento || 0)}</div>
          </div>
          <div className="row">
            <div style={{ flex: 1 }}>Financiamento</div>
            <div style={{ width: 160, textAlign: 'right' }}>{fmt(dfcData.financiamento || 0)}</div>
          </div>
          <div className="row header">
            <div style={{ flex: 1 }}>Variação de Caixa</div>
            <div style={{ width: 160, textAlign: 'right' }}>{fmt((dfcData.operacional || 0) + (dfcData.investimento || 0) + (dfcData.financiamento || 0))}</div>
          </div>
        </div>
      </section>
    </section>
  );
};
