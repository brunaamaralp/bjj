import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { Link } from 'react-router-dom';
import {
  Wallet2,
  CreditCard,
  Banknote,
  Trash2,
  Settings2,
  ChevronDown,
  ChevronUp,
  Plus,
} from 'lucide-react';
import CollectionRulesSection from './CollectionRulesSection.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import './finance.css';

import ExceptionStatusLabelsSection from './ExceptionStatusLabelsSection.jsx';
import {
  readExceptionStatusLabels,
  mergeExceptionLabelsIntoFinanceConfig,
} from '../../lib/paymentExceptions.js';
import { useContractTemplates } from '../../features/contracts/queries.js';
import {
  templatesForPurpose,
  CONTRACT_TEMPLATE_PURPOSE_LABELS,
} from '../../lib/contractPlanTemplates.js';
import { useEnsureAcademyContractSetup } from '../../features/contracts/queries.js';
import {
  FinanceConfigTooLargeError,
  mergeFinanceConfigFromAcademyDoc,
  persistAcademyFinanceConfig,
} from '../../lib/financeConfigStorage.js';
import {
  serializeCollectionRules,
  parseOverdueLabel,
  DEFAULT_COLLECTION_RULES,
  readCollectionSettingsFromFinanceConfig,
  readCollectionSettingsFromAcademy,
  mergeCollectionIntoFinanceConfig,
} from '../../lib/collectionRules.js';
import { filterBankAccountsWithBank } from '../../lib/bankAccounts.js';
import { buildReceivablesPath, RECEIVABLES_SECTIONS } from '../../lib/financeiroReceivablesSections.js';

const INSTALLMENT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const FINANCE_SECTIONS = [
  { id: 'finance-plans', label: 'Planos' },
  { id: 'finance-fees', label: 'Taxas' },
  { id: 'finance-accounts', label: 'Recebimento' },
  { id: 'finance-collection', label: 'Régua' },
  { id: 'finance-exceptions', label: 'Exceções' },
];

const FINANCE_HUB_JUMP_SECTIONS = [
  ...FINANCE_SECTIONS,
  { id: 'finance-plano-contas', label: 'Plano de contas' },
];

function isSectionOpen(sectionId, layout, activeSection) {
  return layout === 'stacked' || activeSection === sectionId;
}

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
    <div className="flex gap-2 finance-section-save">
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

function FinanceSectionHeading({ icon, children }) {
  const iconEl = React.createElement(icon, { size: 18, className: 'finance-config-section__icon', 'aria-hidden': true });
  return (
    <h3 className="navi-section-heading finance-config-section__heading">
      {iconEl}
      {children}
    </h3>
  );
}

function PlanRow({ pl, idx, onUpdate, onRemove }) {
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
          type="text"
          inputMode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          value={pl.price ?? 0}
          onChange={(e) => {
            const raw = String(e.target.value || '').replace(',', '.');
            const n = parseFloat(raw);
            onUpdate(idx, { price: Number.isFinite(n) ? n : 0 });
          }}
        />
      </div>
      <div className="finance-plan-row__actions">
        <button
          type="button"
          className="finance-bank-row__remove"
          title={expanded ? 'Fechar detalhes' : 'Descrição e mais'}
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
          <div className="form-group finance-form-group--tight">
            <label>Descrição</label>
            <input
              className="form-input finance-compact-input"
              value={pl.description || ''}
              onChange={(e) => onUpdate(idx, { description: e.target.value })}
            />
          </div>
          <div className="form-group finance-form-group--tight finance-form-group--narrow">
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
        </div>
      ) : null}
    </div>
  );
}


export default function ConfigTab({ academyId, layout = 'picker', isOwner = true }) {
  const isStacked = layout === 'stacked';
  const addToast = useUiStore((s) => s.addToast);
  const { data: contractTemplatesData, isSuccess: contractTemplatesReady } = useContractTemplates(true);
  const contractTemplates = useMemo(
    () => contractTemplatesData?.templates || [],
    [contractTemplatesData?.templates]
  );
  const contractTemplatesConfigured =
    contractTemplatesReady && contractTemplatesData?.configured !== false;
  const ensureContractSetup = useEnsureAcademyContractSetup();
  const { mutateAsync: mutateEnsureContractSetup } = ensureContractSetup;
  const ensureSetupEffectStartedRef = useRef(false);
  const rescissionTemplates = useMemo(
    () => templatesForPurpose(contractTemplates, 'rescission'),
    [contractTemplates]
  );
  const [savingSection, setSavingSection] = useState(null);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [collectionRules, setCollectionRules] = useState(() => DEFAULT_COLLECTION_RULES.map((r) => ({ ...r })));
  const [overdueLabel, setOverdueLabel] = useState('Inadimplente');
  const [exceptionLabels, setExceptionLabels] = useState(() => readExceptionStatusLabels(null));
  const [installmentsExpanded, setInstallmentsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState(FINANCE_SECTIONS[0].id);
  const [pendingRemovePlan, setPendingRemovePlan] = useState(null);
  const [pendingRemoveBank, setPendingRemoveBank] = useState(null);
  const [lastSaved, setLastSaved] = useState({});
  const [lastSavedSection, setLastSavedSection] = useState('');

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
        let cfg = mergeFinanceConfigFromAcademyDoc(doc);
        if (!cfg || Object.keys(cfg).length === 0) {
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

  const applyEnsureSetupResult = useCallback(
    (result) => {
      const cfg = result?.financeConfig;
      if (cfg && typeof cfg === 'object') {
        const merged = mergeCollectionIntoFinanceConfig(cfg, {
          collectionRules,
          overdueLabel,
        });
        const withExceptions = mergeExceptionLabelsIntoFinanceConfig(merged, exceptionLabels);
        setFinanceConfig(withExceptions);
        useLeadStore.getState().setFinanceConfig(withExceptions);
        if (result.summary?.financeConfigUpdated) {
          setSavedDigests((prev) => ({
            ...prev,
            plans: digestPlans(withExceptions.plans),
          }));
        }
      }
    },
    [collectionRules, overdueLabel, exceptionLabels]
  );

  const applyEnsureSetupResultRef = useRef(applyEnsureSetupResult);
  applyEnsureSetupResultRef.current = applyEnsureSetupResult;

  const runEnsureContractSetup = useCallback(
    async ({ showToast = true } = {}) => {
      if (!academyId || !isOwner || !contractTemplatesConfigured) return null;
      try {
        const result = await mutateEnsureContractSetup();
        applyEnsureSetupResult(result);
        if (showToast) {
          const parts = [];
          if (result.summary.templatesCreated?.length) {
            parts.push(
              result.summary.templatesCreated
                .map((p) => CONTRACT_TEMPLATE_PURPOSE_LABELS[p] || p)
                .join(' e ')
            );
          }
          if (result.summary.plansLinked > 0) {
            parts.push(`${result.summary.plansLinked} plano(s) vinculado(s)`);
          }
          const detail = parts.length ? parts.join(' · ') : 'Nada pendente — já estava configurado.';
          addToast({
            type: result.summary.financeConfigUpdated || result.summary.templatesCreated?.length
              ? 'success'
              : 'info',
            message: `Contratos: ${detail}`,
          });
        }
        return result;
      } catch (e) {
        console.error(e);
        if (showToast) addToast({ type: 'error', message: friendlyError(e, 'action') });
        return null;
      }
    },
    [
      academyId,
      isOwner,
      contractTemplatesConfigured,
      mutateEnsureContractSetup,
      applyEnsureSetupResult,
      addToast,
    ]
  );

  useEffect(() => {
    ensureSetupEffectStartedRef.current = false;
  }, [academyId]);

  useEffect(() => {
    if (!isOwner || !academyId || !contractTemplatesConfigured) return;
    const key = `contractSetupEnsured:${academyId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
    if (ensureSetupEffectStartedRef.current) return;
    ensureSetupEffectStartedRef.current = true;

    void (async () => {
      let result = null;
      try {
        result = await mutateEnsureContractSetup();
        applyEnsureSetupResultRef.current(result);
        const parts = [];
        if (result.summary.templatesCreated?.length) {
          parts.push(
            result.summary.templatesCreated
              .map((p) => CONTRACT_TEMPLATE_PURPOSE_LABELS[p] || p)
              .join(' e ')
          );
        }
        if (result.summary.plansLinked > 0) {
          parts.push(`${result.summary.plansLinked} plano(s) vinculado(s)`);
        }
        const detail = parts.length ? parts.join(' · ') : 'Nada pendente — já estava configurado.';
        addToast({
          type: result.summary.financeConfigUpdated || result.summary.templatesCreated?.length
            ? 'success'
            : 'info',
          message: `Contratos: ${detail}`,
        });
      } catch (e) {
        console.error(e);
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      } finally {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(key, result ? '1' : '0');
        }
      }
    })();
  }, [isOwner, academyId, contractTemplatesConfigured, mutateEnsureContractSetup, addToast]);

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
      const savedCfg = await persistAcademyFinanceConfig(academyId, mergedCfg, {
        databases,
        DB_ID,
        ACADEMIES_COL,
      });
      setFinanceConfig(savedCfg);
      useLeadStore.getState().setFinanceConfig(savedCfg);
      const coll = readCollectionSettingsFromFinanceConfig(savedCfg);
      const labels = readExceptionStatusLabels(savedCfg);
      setSavedDigests({
        accounts: digestBankAccounts(savedCfg.bankAccounts),
        fees: digestCardFees(savedCfg.cardFees),
        plans: digestPlans(savedCfg.plans),
        collection: digestCollection(coll.collectionRules, coll.overdueLabel),
        exceptions: digestExceptionLabels(labels),
      });
      const now = Date.now();
      setLastSaved((prev) => ({ ...prev, [sectionKey]: now }));
      setLastSavedSection(sectionKey);
      addToast({ type: 'success', message: successMessage });
    } catch (e) {
      console.error(e);
      if (e instanceof FinanceConfigTooLargeError) {
        addToast({
          type: 'error',
          message:
            'A configuração financeira ficou grande demais para salvar. Tente encurtar descrições dos planos ou textos da régua de cobrança. Se persistir, peça ao suporte para ampliar o limite no Appwrite (npm run provision:academy-attrs).',
        });
      } else {
        addToast({ type: 'error', message: friendlyError(e, 'save') });
      }
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

  const jumpSectionsBase = isStacked ? FINANCE_HUB_JUMP_SECTIONS : FINANCE_SECTIONS;
  const jumpSections = jumpSectionsBase.filter((s) => {
    if (isOwner) return true;
    return !['finance-plans', 'finance-collection', 'finance-plano-contas'].includes(s.id);
  });

  const scrollToSection = (sectionId) => {
    if (isStacked) {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setActiveSection(sectionId);
  };

  const formatSavedAt = (ts) => {
    if (!ts) return '';
    const d = new Date(ts);
    const sameDay = new Date().toDateString() === d.toDateString();
    if (sameDay) return `Salvo as ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    return `Salvo em ${d.toLocaleDateString('pt-BR')} as ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div
      className={`academy-finance-config academy-finance-config--hub${isStacked ? ' academy-finance-config--stacked' : ''}`}
    >
      <nav className="finance-config-jump" aria-label="Seções do financeiro">
        {jumpSections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`finance-config-jump-link${!isStacked && activeSection === s.id ? ' finance-config-jump-link--active' : ''}`}
            aria-current={!isStacked && activeSection === s.id ? 'true' : undefined}
            onClick={() => scrollToSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {isOwner && isSectionOpen('finance-plans', layout, activeSection) ? (
        <section id="finance-plans" className="finance-config-section animate-in mensal-finance-plans-section">
          <FinanceSectionHeading icon={Wallet2}>Planos de mensalidade</FinanceSectionHeading>
          {lastSaved.plans ? <p className="text-small text-muted finance-config-section__saved">{formatSavedAt(lastSaved.plans)}</p> : null}
          <p className="text-small text-muted finance-config-section__hint mensal-finance-plans-hint">
            Mensalidades dos alunos — usados em Mensalidades e matrícula. Vincule contratos por plano em{' '}
            <Link to="/empresa?tab=financeiro&section=contratos" className="edit-link">
              Empresa → Contratos
            </Link>
            .
          </p>
          {isOwner && contractTemplatesConfigured && rescissionTemplates.length === 0 ? (
            <div className="finance-config-setup-banner card">
              <p className="text-small text-muted finance-config-setup-banner__text">
                Falta o termo de rescisão padrão. Você pode gerar os modelos e vincular todos os planos
                automaticamente.
              </p>
              <button
                type="button"
                className="btn-primary"
                disabled={ensureContractSetup.isPending}
                onClick={() => void runEnsureContractSetup({ showToast: true })}
              >
                {ensureContractSetup.isPending ? 'Configurando…' : 'Configurar contratos automaticamente'}
              </button>
            </div>
          ) : null}
          <div className="finance-config-section__body">
            {(financeConfig.plans || []).map((pl, idx) => (
              <PlanRow
                key={idx}
                pl={pl}
                idx={idx}
                onUpdate={updatePlan}
                onRemove={(i) => setPendingRemovePlan(i)}
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
              onSave={() => persistConfig('plans', 'Planos de mensalidade salvos.')}
            />
            {lastSavedSection === 'plans' ? (
              <Link
                to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.MENSALIDADES })}
                className="finance-config-context-link"
              >
                Ver em Mensalidades →
              </Link>
            ) : null}
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {isSectionOpen('finance-fees', layout, activeSection) ? (
        <section id="finance-fees" className="finance-config-section animate-in">
          <FinanceSectionHeading icon={CreditCard}>Taxas de cartão</FinanceSectionHeading>
          {lastSaved.fees ? <p className="text-small text-muted finance-config-section__saved">{formatSavedAt(lastSaved.fees)}</p> : null}
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
              <span className="ctx-label finance-installments-toggle__label">
                Configurar parcelas
              </span>
              <span className="text-small text-muted finance-installments-toggle__summary">
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
            {lastSavedSection === 'fees' ? (
              <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
                Ver lançamentos →
              </Link>
            ) : null}
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {isSectionOpen('finance-accounts', layout, activeSection) ? (
        <section id="finance-accounts" className="finance-config-section animate-in">
          <FinanceSectionHeading icon={Banknote}>Contas para recebimento</FinanceSectionHeading>
          {lastSaved.accounts ? <p className="text-small text-muted finance-config-section__saved">{formatSavedAt(lastSaved.accounts)}</p> : null}
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
                    onClick={() => setPendingRemoveBank(idx)}
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
            {lastSavedSection === 'accounts' ? (
              <Link to="/financeiro?tab=movimentacoes" className="finance-config-context-link">
                Ver lançamentos →
              </Link>
            ) : null}
          </div>
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}

      {isOwner && isSectionOpen('finance-collection', layout, activeSection) ? (
        <div id="finance-collection" className="finance-config-section-wrap">
          {lastSaved.collection ? <p className="text-small text-muted finance-config-section__saved">{formatSavedAt(lastSaved.collection)}</p> : null}
          <CollectionRulesSection
            collectionRules={collectionRules}
            onRulesChange={setCollectionRules}
          />
          <SectionSaveFooter
            dirty={dirty.collection}
            saving={savingSection === 'collection'}
            onSave={() => persistConfig('collection', 'Régua de cobrança salva.')}
          />
          {lastSavedSection === 'collection' ? (
            <Link
              to={buildReceivablesPath({
                section: RECEIVABLES_SECTIONS.MENSALIDADES,
                filtro: 'overdue',
              })}
              className="finance-config-context-link"
            >
              Ver inadimplentes →
            </Link>
          ) : null}
          <hr className="finance-config-section__divider" aria-hidden />
        </div>
      ) : null}

      {isSectionOpen('finance-exceptions', layout, activeSection) ? (
        <div id="finance-exceptions" className="finance-config-section-wrap">
          {lastSaved.exceptions ? <p className="text-small text-muted finance-config-section__saved">{formatSavedAt(lastSaved.exceptions)}</p> : null}
          <ExceptionStatusLabelsSection labels={exceptionLabels} onChange={setExceptionLabels} />
          <SectionSaveFooter
            dirty={dirty.exceptions}
            saving={savingSection === 'exceptions'}
            onSave={() => persistConfig('exceptions', 'Rótulos de exceção salvos.')}
          />
          {lastSavedSection === 'exceptions' ? (
            <Link
              to={buildReceivablesPath({ section: RECEIVABLES_SECTIONS.MENSALIDADES })}
              className="finance-config-context-link"
            >
              Ver Pendências →
            </Link>
          ) : null}
          <hr className="finance-config-section__divider" aria-hidden />
        </div>
      ) : null}
      <ConfirmDialog
        open={typeof pendingRemovePlan === 'number'}
        title="Remover plano"
        description="Este plano será removido. Alunos vinculados a ele não serão afetados, mas novos cadastros não poderão selecioná-lo. Confirmar?"
        confirmLabel="Remover"
        confirmVariant="danger"
        onClose={() => setPendingRemovePlan(null)}
        onConfirm={() => {
          if (typeof pendingRemovePlan !== 'number') return;
          const arr = [...(financeConfig.plans || [])];
          arr.splice(pendingRemovePlan, 1);
          setFinanceConfig({ ...financeConfig, plans: arr });
          setPendingRemovePlan(null);
        }}
      />
      <ConfirmDialog
        open={typeof pendingRemoveBank === 'number'}
        title="Remover conta bancária"
        description="Esta conta será removida da lista. Lançamentos existentes vinculados a ela não serão alterados. Confirmar?"
        confirmLabel="Remover"
        confirmVariant="danger"
        onClose={() => setPendingRemoveBank(null)}
        onConfirm={() => {
          if (typeof pendingRemoveBank !== 'number') return;
          const arr = [...(financeConfig.bankAccounts || [])];
          arr.splice(pendingRemoveBank, 1);
          setFinanceConfig({ ...financeConfig, bankAccounts: arr });
          setPendingRemoveBank(null);
        }}
      />
    </div>
  );
}
