import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { Link } from 'react-router-dom';
import { Wallet2, CreditCard, Banknote, Trash2, Settings2, ChevronDown, ChevronUp, Plus, Sparkles } from 'lucide-react';
import CollectionRulesSection from './CollectionRulesSection.jsx';
import './mensalidades.css';
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
import { filterBankAccountsWithBank } from '../../lib/bankAccounts.js';

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
    <div className="flex gap-2 finance-section-save" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
      {dirty ? (
        <span className="funil-unsaved-pill" role="status">
          Alterações não salvas
        </span>
      ) : null}
      <button
        type="button"
        className="btn-primary finance-section-save__btn"
        disabled={!dirty || saving}
        onClick={() => void onSave()}
      >
        {saving ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  );
}

function FinanceSectionHeading({ icon: Icon, children }) {
  return (
    <h3 className="navi-section-heading finance-config-section__heading">
      <Icon size={18} color="var(--v500)" aria-hidden />
      {children}
    </h3>
  );
}

function PlanRow({ pl, idx, contractTemplates, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="finance-plan-row">
      <div className="finance-field-col">
        <label>Nome</label>
        <input
          className="form-input finance-compact-input"
          value={pl.name || ''}
          onChange={(e) => onUpdate(idx, { name: e.target.value })}
        />
      </div>
      <div className="finance-field-col">
        <label>Preço (R$)</label>
        <input
          className="form-input finance-compact-input"
          type="number"
          step="0.01"
          min={0}
          value={pl.price ?? 0}
          onChange={(e) => onUpdate(idx, { price: Number(e.target.value || 0) })}
        />
      </div>
      <div className="finance-plan-row__actions">
        <button
          type="button"
          className="finance-bank-row__remove"
          title={expanded ? 'Fechar detalhes' : 'Duração, descrição e mais'}
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          <Settings2 size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="finance-bank-row__remove"
          title="Remover plano"
          onClick={() => onRemove(idx)}
        >
          <Trash2 size={16} aria-hidden />
        </button>
      </div>
      {expanded ? (
        <div className="finance-plan-detail">
          <div className="form-group" style={{ margin: 0 }}>
            <label>Duração (dias)</label>
            <input
              className="form-input finance-compact-input"
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
              className="form-input finance-compact-input"
              value={pl.description || ''}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
            />
          </div>
          <div className="form-group" style={{ margin: 0, maxWidth: 280 }}>
            <label>Aplica taxa cartão</label>
            <select
              className="form-input finance-compact-input"
              value={pl.applyCardFee ? 'sim' : 'nao'}
              onChange={(e) => onUpdate(idx, { applyCardFee: e.target.value === 'sim' })}
            >
              <option value="sim">Sim</option>
              <option value="nao">Não</option>
            </select>
          </div>
          {contractTemplates.length > 0 ? (
            <div className="form-group" style={{ margin: 0, maxWidth: 360 }}>
              <label>Modelo de contrato</label>
              <select
                className="form-input finance-compact-input"
                value={pl.contractTemplateId || ''}
                onChange={(e) => onUpdate(idx, { contractTemplateId: e.target.value || undefined })}
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
  const [activeSection, setActiveSection] = useState(FINANCE_SECTIONS[0].id);

  const [savedDigests, setSavedDigests] = useState({
    accounts: digestBankAccounts([]),
    fees: digestCardFees(defaultFinanceConfig().cardFees),
    plans: digestPlans([]),
    collection: digestCollection(DEFAULT_COLLECTION_RULES, 'Inadimplente'),
    exceptions: digestExceptionLabels(readExceptionStatusLabels(null)),
  });

  const applyLoadedState = useCallback((mergedCfg, coll) => {
    const cfg = {
      ...mergedCfg,
      bankAccounts: filterBankAccountsWithBank(mergedCfg.bankAccounts),
    };
    setFinanceConfig(cfg);
    setCollectionRules(coll.collectionRules);
    setOverdueLabel(coll.overdueLabel);
    const labels = readExceptionStatusLabels(mergedCfg);
    setExceptionLabels(labels);
    setSavedDigests({
      accounts: digestBankAccounts(cfg.bankAccounts),
      fees: digestCardFees(cfg.cardFees),
      plans: digestPlans(cfg.plans),
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
    mergedCfg = {
      ...mergedCfg,
      bankAccounts: filterBankAccountsWithBank(mergedCfg.bankAccounts),
    };
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

  const updatePlan = (idx, patch) => {
    const arr = [...(financeConfig.plans || [])];
    arr[idx] = { ...(arr[idx] || {}), ...patch };
    setFinanceConfig({ ...financeConfig, plans: arr });
  };

  const parcelado = financeConfig.cardFees?.credito_parcelado || {};

  const updateBankAccount = (idx, patch) => {
    const arr = [...(financeConfig.bankAccounts || [])];
    arr[idx] = { ...(arr[idx] || {}), ...patch };
    setFinanceConfig({ ...financeConfig, bankAccounts: arr });
  };

  return (
    <div className="academy-finance-config" style={{ paddingTop: 4 }}>
      <nav className="finance-config-jump" aria-label="Seções do financeiro">
        {FINANCE_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`finance-config-jump-link${activeSection === s.id ? ' finance-config-jump-link--active' : ''}`}
            aria-current={activeSection === s.id ? 'true' : undefined}
            onClick={() => setActiveSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {activeSection === 'finance-accounts' ? (
        <section id="finance-accounts" className="finance-config-section animate-in">
          <FinanceSectionHeading icon={Banknote}>Contas bancárias</FinanceSectionHeading>
          <p className="text-small text-muted finance-config-section__hint">
            Contas usadas em recebimentos e comprovantes. Cadastre banco, agência, conta e PIX.
          </p>
          <div className="finance-config-section__body">
            <div className="finance-bank-list">
              {(financeConfig.bankAccounts || []).map((acc, idx) => (
                <div key={idx} className="finance-bank-row">
                  <div className="finance-field-col">
                    <label>Banco</label>
                    <input
                      className="form-input finance-compact-input"
                      value={acc.bankName || ''}
                      onChange={(e) => updateBankAccount(idx, { bankName: e.target.value })}
                    />
                  </div>
                  <div className="finance-field-col">
                    <label>Agência</label>
                    <input
                      className="form-input finance-compact-input"
                      value={acc.branch || ''}
                      onChange={(e) => updateBankAccount(idx, { branch: e.target.value })}
                    />
                  </div>
                  <div className="finance-field-col">
                    <label>Conta</label>
                    <input
                      className="form-input finance-compact-input"
                      value={acc.account || ''}
                      onChange={(e) => updateBankAccount(idx, { account: e.target.value })}
                    />
                  </div>
                  <div className="finance-field-col">
                    <label>Titular</label>
                    <input
                      className="form-input finance-compact-input"
                      value={acc.accountName || ''}
                      onChange={(e) => updateBankAccount(idx, { accountName: e.target.value })}
                    />
                  </div>
                  <div className="finance-field-col">
                    <label>Chave PIX</label>
                    <input
                      className="form-input finance-compact-input"
                      value={acc.pixKey || ''}
                      onChange={(e) => updateBankAccount(idx, { pixKey: e.target.value })}
                    />
                  </div>
                  <button
                    type="button"
                    className="finance-bank-row__remove"
                    title="Remover conta"
                    aria-label="Remover conta"
                    onClick={() => {
                      const arr = [...(financeConfig.bankAccounts || [])];
                      arr.splice(idx, 1);
                      setFinanceConfig({ ...financeConfig, bankAccounts: arr });
                    }}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="finance-config-add-link edit-link"
              onClick={() => {
                const arr = [...(financeConfig.bankAccounts || [])];
                arr.push({ bankName: '', branch: '', account: '', accountName: '', pixKey: '' });
                setFinanceConfig({ ...financeConfig, bankAccounts: arr });
              }}
            >
              <Plus size={14} aria-hidden />
              Adicionar conta
            </button>
            <SectionSaveFooter
              dirty={dirty.accounts}
              saving={savingSection === 'accounts'}
              onSave={() => persistConfig('accounts', 'Contas bancárias salvas.')}
            />
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {activeSection === 'finance-fees' ? (
        <section id="finance-fees" className="finance-config-section animate-in">
          <FinanceSectionHeading icon={CreditCard}>Taxas de cartão</FinanceSectionHeading>
          <p className="text-small text-muted finance-config-section__hint">
            Percentuais descontados em pagamentos com cartão e PIX na mensalidade.
          </p>
          <div className="finance-config-section__body">
            <div className="finance-fees-row">
              <div className="finance-field-col">
                <label>PIX (%)</label>
                <input
                  className="form-input finance-compact-input"
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
              <div className="finance-field-col">
                <label>Débito (%)</label>
                <input
                  className="form-input finance-compact-input"
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
              <div className="finance-field-col">
                <label>Crédito à vista (%)</label>
                <input
                  className="form-input finance-compact-input"
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
                  <div key={n} className="finance-field-col">
                    <label>{n}x</label>
                    <input
                      className="form-input finance-compact-input"
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
            <SectionSaveFooter
              dirty={dirty.fees}
              saving={savingSection === 'fees'}
              onSave={() => persistConfig('fees', 'Taxas de cartão salvas.')}
            />
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {activeSection === 'finance-collection' ? (
        <div id="finance-collection" className="finance-config-section-wrap">
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
          <hr className="finance-config-section__divider" aria-hidden />
        </div>
      ) : null}

      {activeSection === 'finance-plans' ? (
        <section id="finance-plans" className="finance-config-section animate-in mensal-finance-plans-section">
          <FinanceSectionHeading icon={Wallet2}>Planos da academia</FinanceSectionHeading>
          <p className="text-small text-muted finance-config-section__hint mensal-finance-plans-hint">
            Mensalidades dos alunos — usados em Mensalidades, matrícula e contratos.
          </p>
          <div className="finance-config-section__body">
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
            <button
              type="button"
              className="finance-config-add-link edit-link"
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
              <Plus size={14} aria-hidden />
              Adicionar plano
            </button>
            <SectionSaveFooter
              dirty={dirty.plans}
              saving={savingSection === 'plans'}
              onSave={() => persistConfig('plans', 'Planos salvos.')}
            />
          </div>
          <div className="finance-nave-subscription">
            <h4 className="navi-section-heading finance-nave-subscription__heading">
              <Sparkles size={16} color="var(--v500)" aria-hidden />
              Assinatura Nave
            </h4>
            <p className="text-small text-muted" style={{ margin: '0 0 8px' }}>
              Plano do sistema (IA, limites e faturamento) — independente das mensalidades dos alunos.
            </p>
            <Link to="/conta" className="edit-link" style={{ fontSize: '0.85rem' }}>
              Gerenciar em Conta → Assinatura
            </Link>
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {activeSection === 'finance-exceptions' ? (
        <div id="finance-exceptions" className="finance-config-section-wrap">
          <ExceptionStatusLabelsSection labels={exceptionLabels} onChange={setExceptionLabels} />
          <SectionSaveFooter
            dirty={dirty.exceptions}
            saving={savingSection === 'exceptions'}
            onSave={() => persistConfig('exceptions', 'Rótulos de exceção salvos.')}
          />
          <hr className="finance-config-section__divider" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
