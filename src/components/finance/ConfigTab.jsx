import React, { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { Wallet2, CreditCard, Banknote, Trash2 } from 'lucide-react';

const defaultFinanceConfig = () => ({
  cardFees: {
    pix: { percent: 0, fixed: 0 },
    debito: { percent: 0, fixed: 0 },
    credito_avista: { percent: 0, fixed: 0 },
    credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
  },
  bankAccounts: [],
  plans: []
});

export default function ConfigTab({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [configDirty, setConfigDirty] = useState(false);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);

  useEffect(() => {
    if (!academyId) return;
    const st = useLeadStore.getState();
    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {
      setFinanceConfig(st.financeConfig);
      setConfigDirty(false);
      return;
    }
    const loadAid = academyId;
    databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        if (loadAid !== useLeadStore.getState().academyId) return;
        let cfg = null;
        try {
          cfg = doc.financeConfig ? (typeof doc.financeConfig === 'string' ? JSON.parse(doc.financeConfig) : doc.financeConfig) : null;
        } catch {
          cfg = null;
        }
        if (!cfg) {
          cfg = defaultFinanceConfig();
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
        setConfigDirty(false);
        useLeadStore.getState().setFinanceConfig(cfg);
      })
      .catch((e) => {
        console.error(e);
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      });
  }, [academyId]);

  const handleSaveConfig = async () => {
    if (!academyId) return;
    setSaving(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        financeConfig: JSON.stringify(financeConfig || {})
      });
      useLeadStore.getState().setFinanceConfig(financeConfig || {});
      setConfigDirty(false);
      addToast({ type: 'success', message: 'Configurações financeiras salvas.' });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="academy-finance-config" style={{ paddingTop: 4 }}>
      <section className="mt-2 animate-in" style={{ animationDelay: '0.05s' }}>
        <h3 className="navi-section-heading mb-2"><Banknote size={18} color="var(--v500)" /> Contas bancárias</h3>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.bankAccounts || []).map((acc, idx) => (
              <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Banco</label>
                  <input className="form-input" value={acc.bankName || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), bankName: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label>Agência</label>
                  <input className="form-input" value={acc.branch || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), branch: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 180 }}>
                  <label>Conta</label>
                  <input className="form-input" value={acc.account || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), account: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Titular</label>
                  <input className="form-input" value={acc.accountName || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), accountName: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Chave PIX</label>
                  <input className="form-input" value={acc.pixKey || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr[idx] = { ...(arr[idx] || {}), pixKey: e.target.value };
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }} />
                </div>
                <button type="button" className="btn-ghost" title="Remover" onClick={() => {
                  setConfigDirty(true);
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
                setConfigDirty(true);
                const arr = [...(financeConfig.bankAccounts || [])];
                arr.push({ bankName: '', branch: '', account: '', accountName: '', pixKey: '' });
                setFinanceConfig({ ...financeConfig, bankAccounts: arr });
              }}>Adicionar conta</button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
        <h3 className="navi-section-heading mb-2"><CreditCard size={18} color="var(--v500)" /> Taxas de cartão</h3>
        <div className="card">
          <div className="flex-col gap-4">
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}>
                <label>PIX (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.pix?.percent ?? 0} onChange={(e) => {
                  setConfigDirty(true);
                  setFinanceConfig((prev) => ({ ...prev, cardFees: { ...(prev.cardFees || {}), pix: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Débito (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.debito?.percent ?? 0} onChange={(e) => {
                  setConfigDirty(true);
                  setFinanceConfig((prev) => ({ ...prev, cardFees: { ...(prev.cardFees || {}), debito: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Crédito à vista (%)</label>
                <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.credito_avista?.percent ?? 0} onChange={(e) => {
                  setConfigDirty(true);
                  setFinanceConfig((prev) => ({ ...prev, cardFees: { ...(prev.cardFees || {}), credito_avista: { percent: Number(e.target.value || 0), fixed: 0 } } }));
                }} />
              </div>
            </div>
            <div>
              <span className="ctx-label" style={{ display: 'block', marginBottom: 8 }}>Crédito parcelado (%)</span>
              <div className="flex" style={{ gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                {[2,3,4,5,6,7,8,9,10,11,12].map((n) => (
                  <div key={n} className="form-group" style={{ width: 96 }}>
                    <label style={{ fontSize: 12 }}>{n}x</label>
                    <input className="form-input" type="number" min={0} step="0.01" value={financeConfig.cardFees?.credito_parcelado?.[String(n)] ?? 0} onChange={(e) => {
                      setConfigDirty(true);
                      setFinanceConfig((prev) => {
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

      <section className="mt-4 animate-in" style={{ animationDelay: '0.15s' }}>
        <h3 className="navi-section-heading mb-2"><Wallet2 size={18} color="var(--v500)" /> Planos</h3>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.plans || []).map((pl, idx) => (
              <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Nome</label>
                  <input className="form-input" value={pl.name || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), name: e.target.value };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Preço (R$)</label>
                  <input className="form-input" type="number" step="0.01" min={0} value={pl.price ?? 0} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), price: Number(e.target.value || 0) };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label>Duração (dias)</label>
                  <input className="form-input" type="number" min={1} value={pl.durationDays ?? 30} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), durationDays: Number(e.target.value || 0) };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Descrição</label>
                  <input className="form-input" value={pl.description || ''} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), description: e.target.value };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }} />
                </div>
                <div className="form-group" style={{ width: 160 }}>
                  <label>Aplica taxa cartão</label>
                  <select className="form-input" value={pl.applyCardFee ? 'sim' : 'nao'} onChange={(e) => {
                    setConfigDirty(true);
                    const arr = [...(financeConfig.plans || [])];
                    arr[idx] = { ...(arr[idx] || {}), applyCardFee: e.target.value === 'sim' };
                    setFinanceConfig({ ...financeConfig, plans: arr });
                  }}>
                    <option value="sim">Sim</option>
                    <option value="nao">Não</option>
                  </select>
                </div>
                <button type="button" className="btn-ghost" title="Remover" onClick={() => {
                  setConfigDirty(true);
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
                setConfigDirty(true);
                const arr = [...(financeConfig.plans || [])];
                arr.push({ name: '', price: 0, durationDays: 30, description: '', applyCardFee: true });
                setFinanceConfig({ ...financeConfig, plans: arr });
              }}>Adicionar plano</button>
            </div>
          </div>
        </div>
      </section>

      <div className="flex gap-2 mt-4" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        {configDirty ? (
          <span style={{ fontSize: 11, color: '#d97706', fontWeight: 600 }}>• Alterações não salvas</span>
        ) : null}
        <button
          type="button"
          className={configDirty ? 'btn-secondary' : 'btn-outline'}
          onClick={() => void handleSaveConfig()}
          disabled={saving || !configDirty}
          style={configDirty ? { position: 'relative' } : undefined}
        >
          {saving ? 'Salvando...' : (
            <>
              Salvar alterações
              {configDirty ? (
                <span aria-hidden style={{ color: '#ea580c', marginLeft: 6 }} title="Alterações pendentes">●</span>
              ) : null}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
