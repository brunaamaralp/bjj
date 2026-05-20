import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { Wallet2, CreditCard, Banknote, Trash2, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import CollectionRulesSection from './CollectionRulesSection.jsx';
import ExceptionStatusLabelsSection from './ExceptionStatusLabelsSection.jsx';
import {
  readExceptionStatusLabels,
  mergeExceptionLabelsIntoFinanceConfig,
} from '../../lib/paymentExceptions.js';
import { useContractTemplates } from '../../features/contracts/queries.js';
import {
  serializeCollectionRules,
  parseOverdueLabel,
  DEFAULT_COLLECTION_RULES,
  readCollectionSettingsFromFinanceConfig,
  readCollectionSettingsFromAcademy,
  mergeCollectionIntoFinanceConfig,
} from '../../lib/collectionRules.js';

const INSTALLMENT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const FINANCE_SECTIONS = [
  { id: 'finance-accounts', label: 'Contas' },
  { id: 'finance-fees', label: 'Taxas' },
  { id: 'finance-collection', label: 'Régua' },
  { id: 'finance-plans', label: 'Planos' },
  { id: 'finance-exceptions', label: 'Exceções' },
];

const defaultFinanceConfig = () => ({
  cardFees: {
    pix: { percent: 0, fixed: 0 },
    debito: { percent: 0, fixed: 0 },
    credito_avista: { percent: 0, fixed: 0 },
    credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 },
  },
  bankAccounts: [],
  plans: [],
});

function digestBankAccounts(accounts) {
  return JSON.stringify(accounts || []);
}

function digestCardFees(cardFees) {
  return JSON.stringify(cardFees || {});
}

function digestPlans(plans) {
  return JSON.stringify(plans || []);
}

function digestCollection(rules, overdueLabel) {
  return JSON.stringify({
    rules: serializeCollectionRules(rules),
    overdue: parseOverdueLabel(overdueLabel),
  });
}

function digestExceptionLabels(labels) {
  return JSON.stringify(readExceptionStatusLabels({ exceptionStatusLabels: labels }));
}

function installmentSummary(parcelado) {
  const active = INSTALLMENT_COUNTS.filter((n) => Number(parcelado?.[String(n)] ?? 0) > 0);
  if (active.length === 0) return 'Parcelamento: nenhuma taxa configurada';
  const min = Math.min(...active);
  const max = Math.max(...active);
  if (min === max) return `Parcelamento ativo: ${min}x`;
  return `Parcelamento ativo: ${min}x a ${max}x`;
}

function SectionSaveFooter({ dirty, saving, onSave }) {
  return (
    <div className="flex gap-2 mt-3" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      {dirty ? (
        <span className="funil-unsaved-pill" role="status">
          Alterações não salvas
        </span>
      ) : null}
      <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={() => void onSave()}>
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}

function PlanRow({ pl, idx, contractTemplates, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="funil-question-row" style={{ marginBottom: 0 }}>
      <div className="funil-question-row-main">
        <div className="form-group" style={{ flex: '2 1 160px', margin: 0, minWidth: 0 }}>
          <label>Nome</label>
          <input
            className="form-input"
            value={pl.name || ''}
            onChange={(e) => onUpdate(idx, { name: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ flex: '1 1 120px', margin: 0, minWidth: 0 }}>
          <label>Preço (R$)</label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            min={0}
            value={pl.price ?? 0}
            onChange={(e) => onUpdate(idx, { price: Number(e.target.value || 0) })}
          />
        </div>
        <div className="funil-question-actions">
          <button
            type="button"
            className="icon-btn icon-only"
            title={expanded ? 'Fechar detalhes' : 'Duração, descrição e mais'}
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <Settings2 size={14} />
          </button>
          <button type="button" className="btn-ghost" title="Remover plano" onClick={() => onRemove(idx)}>
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="funil-question-detail">
          <div className="form-group" style={{ margin: 0 }}>
            <label>Duração (dias)</label>
            <input
              className="form-input"
              type="number"
              min={1}
              value={pl.durationDays ?? 30}
              onChange={(e) => onUpdate(idx, { durationDays: Number(e.target.value || 0) })}
            />
            <p className="text-xs text-light" style={{ margin: '4px 0 0' }}>
              Usado para calcular vencimento da mensalidade.
            </p>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>Descrição</label>
            <input
              className="form-input"
              value={pl.description || ''}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ margin: 0, maxWidth: 280 }}>
            <label>Aplica taxa cartão</label>
            <select
              className="form-input"
              value={pl.applyCardFee ? 'sim' : 'nao'}
              onChange={(e) => onUpdate(idx, { applyCardFee: e.target.value === 'sim' })}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
            <p className="text-xs text-light" style={{ margin: '4px 0 0' }}>
              Repassa o percentual definido em Taxas de Cartão ao aluno.
            </p>
          </div>
          {contractTemplates.length > 0 ? (
            <div className="form-group" style={{ margin: 0, maxWidth: 360 }}>
              <label>Modelo de contrato</label>
              <select
                className="form-input"
                value={pl.contractTemplateId || ''}
                onChange={(e) =>
                  onUpdate(idx, { contractTemplateId: e.target.value || undefined })
                }
              >
                <option value="">— automático —</option>
                {contractTemplates.map((t) => (
                  <option key={t.$id} value={t.$id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}


export default function ConfigTab({ academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const { data: contractTemplatesData } = useContractTemplates(true);
  const contractTemplates = contractTemplatesData?.templates || [];
  const [savingSection, setSavingSection] = useState(null);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [collectionRules, setCollectionRules] = useState(() => DEFAULT_COLLECTION_RULES.map((r) => ({ ...r })));
  const [overdueLabel, setOverdueLabel] = useState('Inadimplente');
  const [exceptionLabels, setExceptionLabels] = useState(() => readExceptionStatusLabels(null));
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);

  const [savedDigests, setSavedDigests] = useState({
    accounts: digestBankAccounts([]),
    fees: digestCardFees(defaultFinanceConfig().cardFees),
    plans: digestPlans([]),
    collection: digestCollection(DEFAULT_COLLECTION_RULES, 'Inadimplente'),
    exceptions: digestExceptionLabels(readExceptionStatusLabels(null)),
  });

  const applyLoadedState = useCallback((mergedCfg, coll) => {
    setFinanceConfig(mergedCfg);
    setCollectionRules(coll.collectionRules);
    setOverdueLabel(coll.overdueLabel);
    const labels = readExceptionStatusLabels(mergedCfg);
    setExceptionLabels(labels);
    setSavedDigests({
      accounts: digestBankAccounts(mergedCfg.bankAccounts),
      fees: digestCardFees(mergedCfg.cardFees),
      plans: digestPlans(mergedCfg.plans),
      collection: digestCollection(coll.collectionRules, coll.overdueLabel),
      exceptions: digestExceptionLabels(labels),
    });
  }, []);

  useEffect(() => {
    if (!academyId) return;
    const st = useLeadStore.getState();
    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {
      const coll = readCollectionSettingsFromFinanceConfig(st.financeConfig);
      applyLoadedState(st.financeConfig, coll);
      return;
    }
    const loadAid = academyId;
    databases
      .getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        if (loadAid !== useLeadStore.getState().academyId) return;
        let cfg = null;
        try {
          cfg = doc.financeConfig
            ? typeof doc.financeConfig === 'string'
              ? JSON.parse(doc.financeConfig)
              : doc.financeConfig
            : null;
        } catch {
          cfg = null;
        }
        if (!cfg) {
          cfg = defaultFinanceConfig();
          if (
            typeof doc.debitPercentage !== 'undefined' ||
            typeof doc.creditPercentage !== 'undefined' ||
            typeof doc.creditInstallmentPercentage !== 'undefined'
          ) {
            const deb = Number(doc.debitPercentage ?? 0) || 0;
            const cre = Number(doc.creditPercentage ?? 0) || 0;
            const crePar = Number(doc.creditInstallmentPercentage ?? 0) || 0;
            const parcelasMap = {};
            for (let i = 2; i <= 12; i++) parcelasMap[String(i)] = crePar;
            cfg.cardFees = {
              pix: { percent: 0, fixed: 0 },
              debito: { percent: deb, fixed: 0 },
              credito_avista: { percent: cre, fixed: 0 },
              credito_parcelado: parcelasMap,
            };
          }
        }
        const coll = readCollectionSettingsFromAcademy(doc);
        const mergedCfg = mergeCollectionIntoFinanceConfig(cfg, coll);
        applyLoadedState(mergedCfg, coll);
        useLeadStore.getState().setFinanceConfig(mergedCfg);
      })
      .catch((e) => {
        console.error(e);
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      });
  }, [academyId, applyLoadedState, addToast]);

  const dirty = useMemo(
    () => ({
      accounts: digestBankAccounts(financeConfig.bankAccounts) !== savedDigests.accounts,
      fees: digestCardFees(financeConfig.cardFees) !== savedDigests.fees,
      plans: digestPlans(financeConfig.plans) !== savedDigests.plans,
      collection:
        digestCollection(collectionRules, overdueLabel) !== savedDigests.collection,
      exceptions: digestExceptionLabels(exceptionLabels) !== savedDigests.exceptions,
    }),
    [financeConfig, collectionRules, overdueLabel, exceptionLabels, savedDigests]
  );

  const buildMergedConfig = useCallback(() => {
    let mergedCfg = mergeCollectionIntoFinanceConfig(financeConfig, {
      collectionRules,
      overdueLabel,
    });
    mergedCfg = mergeExceptionLabelsIntoFinanceConfig(mergedCfg, exceptionLabels);
    return mergedCfg;
  }, [financeConfig, collectionRules, overdueLabel, exceptionLabels]);

  const persistConfig = async (sectionKey, successMessage) => {
    if (!academyId) return;
    setSavingSection(sectionKey);
    try {
      const mergedCfg = buildMergedConfig();
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        financeConfig: JSON.stringify(mergedCfg),
      });
      setFinanceConfig(mergedCfg);
      useLeadStore.getState().setFinanceConfig(mergedCfg);
      const coll = readCollectionSettingsFromFinanceConfig(mergedCfg);
      const labels = readExceptionStatusLabels(mergedCfg);
      setSavedDigests({
        accounts: digestBankAccounts(mergedCfg.bankAccounts),
        fees: digestCardFees(mergedCfg.cardFees),
        plans: digestPlans(mergedCfg.plans),
        collection: digestCollection(coll.collectionRules, coll.overdueLabel),
        exceptions: digestExceptionLabels(labels),
      });
      addToast({ type: 'success', message: successMessage });
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingSection(null);
    }
  };

  const scrollToSection = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const updatePlan = (idx, patch) => {
    const arr = [...(financeConfig.plans || [])];
    arr[idx] = { ...(arr[idx] || {}), ...patch };
    setFinanceConfig({ ...financeConfig, plans: arr });
  };

  const parcelado = financeConfig.cardFees?.credito_parcelado || {};

  return (
    <div className="academy-finance-config" style={{ paddingTop: 4 }}>
      <nav className="finance-config-jump" aria-label="Ir para seção do financeiro">
        {FINANCE_SECTIONS.map((s) => (
          <button key={s.id} type="button" className="finance-config-jump-link" onClick={() => scrollToSection(s.id)}>
            {s.label}
          </button>
        ))}
      </nav>

      <section id="finance-accounts" className="mt-2 animate-in empresa-section" style={{ animationDelay: '0.05s', scrollMarginTop: 56 }}>
        <h3 className="navi-section-heading mb-2">
          <Banknote size={18} color="var(--v500)" /> Contas bancárias
        </h3>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.bankAccounts || []).map((acc, idx) => (
              <div key={idx} className="flex" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Banco</label>
                  <input
                    className="form-input"
                    value={acc.bankName || ''}
                    onChange={(e) => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr[idx] = { ...(arr[idx] || {}), bankName: e.target.value };
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  />
                </div>
                <div className="form-group" style={{ width: 140 }}>
                  <label>Agência</label>
                  <input
                    className="form-input"
                    value={acc.branch || ''}
                    onChange={(e) => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr[idx] = { ...(arr[idx] || {}), branch: e.target.value };
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  />
                </div>
                <div className="form-group" style={{ width: 180 }}>
                  <label>Conta</label>
                  <input
                    className="form-input"
                    value={acc.account || ''}
                    onChange={(e) => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr[idx] = { ...(arr[idx] || {}), account: e.target.value };
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Titular</label>
                  <input
                    className="form-input"
                    value={acc.accountName || ''}
                    onChange={(e) => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr[idx] = { ...(arr[idx] || {}), accountName: e.target.value };
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Chave PIX</label>
                  <input
                    className="form-input"
                    value={acc.pixKey || ''}
                    onChange={(e) => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr[idx] = { ...(arr[idx] || {}), pixKey: e.target.value };
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  />
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  title="Remover"
                  onClick={() => {
                    const arr = [...(financeConfig.bankAccounts || [])];
                    arr.splice(idx, 1);
                    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                  }}
                  style={{ alignSelf: 'center' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  const arr = [...(financeConfig.bankAccounts || [])];
                  arr.push({ bankName: '', branch: '', account: '', accountName: '', pixKey: '' });
                  setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                }}
              >
                Adicionar conta
              </button>
            </div>
          </div>
          <SectionSaveFooter
            dirty={dirty.accounts}
            saving={savingSection === 'accounts'}
            onSave={() => persistConfig('accounts', 'Contas bancárias salvas.')}
          />
        </div>
      </section>

      <section id="finance-fees" className="mt-4 animate-in empresa-section" style={{ animationDelay: '0.1s', scrollMarginTop: 56 }}>
        <h3 className="navi-section-heading mb-2">
          <CreditCard size={18} color="var(--v500)" /> Taxas de cartão
        </h3>
        <div className="card">
          <div className="flex-col gap-4">
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                <label>PIX (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={financeConfig.cardFees?.pix?.percent ?? 0}
                  onChange={(e) => {
                    setFinanceConfig((prev) => ({
                      ...prev,
                      cardFees: {
                        ...(prev.cardFees || {}),
                        pix: { percent: Number(e.target.value || 0), fixed: 0 },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                <label>Débito (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={financeConfig.cardFees?.debito?.percent ?? 0}
                  onChange={(e) => {
                    setFinanceConfig((prev) => ({
                      ...prev,
                      cardFees: {
                        ...(prev.cardFees || {}),
                        debito: { percent: Number(e.target.value || 0), fixed: 0 },
                      },
                    }));
                  }}
                />
              </div>
              <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
                <label>Crédito à vista (%)</label>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  step="0.01"
                  value={financeConfig.cardFees?.credito_avista?.percent ?? 0}
                  onChange={(e) => {
                    setFinanceConfig((prev) => ({
                      ...prev,
                      cardFees: {
                        ...(prev.cardFees || {}),
                        credito_avista: { percent: Number(e.target.value || 0), fixed: 0 },
                      },
                    }));
                  }}
                />
              </div>
            </div>
            <div>
              <button
                type="button"
                className="finance-installments-toggle"
                aria-expanded={installmentsExpanded}
                onClick={() => setInstallmentsExpanded((v) => !v)}
              >
                <span className="ctx-label" style={{ fontWeight: 600 }}>
                  Configurar parcelas
                </span>
                <span className="text-small text-muted" style={{ flex: 1, textAlign: 'left' }}>
                  {installmentSummary(parcelado)}
                </span>
                {installmentsExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
              {installmentsExpanded ? (
                <div className="finance-installments-grid">
                  {INSTALLMENT_COUNTS.map((n) => (
                    <div key={n} className="form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 12 }}>{n}x</label>
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        step="0.01"
                        value={parcelado[String(n)] ?? 0}
                        onChange={(e) => {
                          setFinanceConfig((prev) => {
                            const mp = { ...((prev.cardFees || {}).credito_parcelado || {}) };
                            mp[String(n)] = Number(e.target.value || 0);
                            return {
                              ...prev,
                              cardFees: { ...(prev.cardFees || {}), credito_parcelado: mp },
                            };
                          });
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <SectionSaveFooter
            dirty={dirty.fees}
            saving={savingSection === 'fees'}
            onSave={() => persistConfig('fees', 'Taxas de cartão salvas.')}
          />
        </div>
      </section>

      <div id="finance-collection" className="empresa-section" style={{ scrollMarginTop: 56 }}>
        <CollectionRulesSection
          collectionRules={collectionRules}
          overdueLabel={overdueLabel}
          onRulesChange={setCollectionRules}
          onOverdueLabelChange={setOverdueLabel}
        />
        <SectionSaveFooter
          dirty={dirty.collection}
          saving={savingSection === 'collection'}
          onSave={() => persistConfig('collection', 'Régua de cobrança salva.')}
        />
      </div>

      <section id="finance-plans" className="mt-4 animate-in empresa-section" style={{ animationDelay: '0.15s', scrollMarginTop: 56 }}>
        <h3 className="navi-section-heading mb-2">
          <Wallet2 size={18} color="var(--v500)" /> Planos
        </h3>
        <p className="text-small text-muted mb-2" style={{ lineHeight: 1.45 }}>
          Os nomes cadastrados aqui aparecem como lista no perfil do aluno, nos pagamentos e nas transações — evita erro
          de digitação.
        </p>
        <div className="card">
          <div className="flex-col" style={{ gap: 10 }}>
            {(financeConfig.plans || []).map((pl, idx) => (
              <PlanRow
                key={idx}
                pl={pl}
                idx={idx}
                contractTemplates={contractTemplates}
                onUpdate={updatePlan}
                onRemove={(i) => {
                  const arr = [...(financeConfig.plans || [])];
                  arr.splice(i, 1);
                  setFinanceConfig({ ...financeConfig, plans: arr });
                }}
              />
            ))}
            <div>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  const arr = [...(financeConfig.plans || [])];
                  arr.push({
                    name: '',
                    price: 0,
                    durationDays: 30,
                    description: '',
                    applyCardFee: true,
                  });
                  setFinanceConfig({ ...financeConfig, plans: arr });
                }}
              >
                Adicionar plano
              </button>
            </div>
          </div>
          <SectionSaveFooter
            dirty={dirty.plans}
            saving={savingSection === 'plans'}
            onSave={() => persistConfig('plans', 'Planos salvos.')}
          />
        </div>
      </section>

      <div id="finance-exceptions" className="empresa-section" style={{ scrollMarginTop: 56 }}>
        <ExceptionStatusLabelsSection labels={exceptionLabels} onChange={setExceptionLabels} />
        <SectionSaveFooter
          dirty={dirty.exceptions}
          saving={savingSection === 'exceptions'}
          onSave={() => persistConfig('exceptions', 'Rótulos de exceção salvos.')}
        />
      </div>
    </div>
  );
}
