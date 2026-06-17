import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages';
import {
  readExceptionStatusLabels,
  mergeExceptionLabelsIntoFinanceConfig,
} from '../lib/paymentExceptions.js';
import { useContractTemplates } from '../features/contracts/queries.js';
import { CONTRACT_TEMPLATE_PURPOSE_LABELS } from '../lib/contractPlanTemplates.js';
import { useEnsureAcademyContractSetup } from '../features/contracts/queries.js';
import {
  serializeCollectionRules,
  parseOverdueLabel,
  DEFAULT_COLLECTION_RULES,
  readCollectionSettingsFromFinanceConfig,
  readCollectionSettingsFromAcademy,
  mergeCollectionIntoFinanceConfig,
} from '../lib/collectionRules.js';
import { filterBankAccountsWithBank, hasConfiguredBankAccounts } from '../lib/bankAccounts.js';
import { digestMethodBankDefaults, normalizeDefaultAccountByMethodMap, readDefaultAccountByMethod } from '../lib/paymentMethodBankDefaults.js';
import {
  defaultWhatsappRemindersConfig,
  digestWhatsappReminders,
  mergeWhatsappRemindersIntoFinanceConfig,
} from '../lib/financeWhatsappReminders.js';
import {
  FinanceConfigTooLargeError,
  mergeFinanceConfigFromAcademyDoc,
  persistAcademyFinanceConfig,
} from '../lib/financeConfigStorage.js';
import { normalizeFinanceVendors } from '../lib/financeVendors.js';
import { defaultAcquirerFees, normalizeAcquirerFees, normalizeAcquirerFeePolicy } from '../lib/acquirerFees.js';
import {
  formatFinanceConfigSaveError,
  validateFinanceConfigBeforeSave,
  firstFinanceConfigIssueSection,
} from '../lib/financeConfigValidation.js';

export const INSTALLMENT_COUNTS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export const defaultFinanceConfig = () => ({
  cardFees: {
    pix: { percent: 0, fixed: 0 },
    debito: { percent: 0, fixed: 0 },
    credito_avista: { percent: 0, fixed: 0 },
    credito_parcelado: {
      '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0,
    },
  },
  acquirerFees: defaultAcquirerFees(),
  acquirerFeePolicy: 'absorb',
  bankAccounts: [],
  defaultAccountByMethod: {},
  plans: [],
  vendors: [],
  whatsappReminders: defaultWhatsappRemindersConfig(),
});

export function digestBankAccounts(accounts, financeConfig = null) {
  if (!financeConfig) return JSON.stringify(accounts || []);
  return JSON.stringify({
    accounts: accounts || [],
    defaultAccountByMethod: digestMethodBankDefaults(financeConfig),
  });
}

export function digestCardFees(cardFees) {
  return JSON.stringify(cardFees || {});
}

export function digestPlans(plans) {
  return JSON.stringify(plans || []);
}

export function digestVendors(vendors) {
  return JSON.stringify(normalizeFinanceVendors(vendors));
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

export function installmentSummary(parcelado) {
  const active = INSTALLMENT_COUNTS.filter((n) => Number(parcelado?.[String(n)] ?? 0) > 0);
  if (active.length === 0) return 'Nenhuma taxa de parcelamento';
  const min = Math.min(...active);
  const max = Math.max(...active);
  if (min === max) return `Parcelamento ${min}x`;
  return `Parcelamento ${min}x–${max}x`;
}

export function useFinanceConfigState(academyId, { isOwner = true } = {}) {
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

  const [loading, setLoading] = useState(Boolean(academyId));
  const [saving, setSaving] = useState(false);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [collectionRules, setCollectionRules] = useState(() => DEFAULT_COLLECTION_RULES.map((r) => ({ ...r })));
  const [overdueLabel, setOverdueLabel] = useState('Inadimplente');
  const [exceptionLabels, setExceptionLabels] = useState(() => readExceptionStatusLabels(null));
  const [pendingRemovePlan, setPendingRemovePlan] = useState(null);
  const [pendingRemoveBank, setPendingRemoveBank] = useState(null);
  const [pendingRemoveVendor, setPendingRemoveVendor] = useState(null);

  const [savedDigests, setSavedDigests] = useState({
    accounts: digestBankAccounts([], defaultFinanceConfig()),
    fees: digestCardFees(defaultFinanceConfig().cardFees),
    plans: digestPlans([]),
    collection: digestCollection(DEFAULT_COLLECTION_RULES, 'Inadimplente'),
    exceptions: digestExceptionLabels(readExceptionStatusLabels(null)),
    whatsapp: digestWhatsappReminders(defaultWhatsappRemindersConfig()),
    vendors: digestVendors([]),
  });

  const applyLoadedState = useCallback((mergedCfg, coll) => {
    const cfg = mergeWhatsappRemindersIntoFinanceConfig({
      ...mergedCfg,
      bankAccounts: filterBankAccountsWithBank(mergedCfg.bankAccounts),
    });
    setFinanceConfig(cfg);
    setCollectionRules(coll.collectionRules);
    setOverdueLabel(coll.overdueLabel);
    const labels = readExceptionStatusLabels(mergedCfg);
    setExceptionLabels(labels);
    setSavedDigests({
      accounts: digestBankAccounts(cfg.bankAccounts, cfg),
      fees: digestCardFees(cfg.cardFees),
      plans: digestPlans(cfg.plans),
      collection: digestCollection(coll.collectionRules, coll.overdueLabel),
      exceptions: digestExceptionLabels(labels),
      whatsapp: digestWhatsappReminders(cfg.whatsappReminders),
      vendors: digestVendors(cfg.vendors),
    });
  }, []);

  const reloadFromServer = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      let cfg = mergeFinanceConfigFromAcademyDoc(doc);
      if (!cfg || Object.keys(cfg).length === 0) {
        cfg = defaultFinanceConfig();
      }
      if (!(cfg.plans?.length || cfg.bankAccounts?.length || cfg.cardFees)) {
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
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setLoading(false);
    }
  }, [academyId, applyLoadedState, addToast]);

  useEffect(() => {
    if (!academyId) {
      setLoading(false);
      return;
    }
    const st = useLeadStore.getState();
    if (
      st.financeConfig != null &&
      st.financeConfigAcademyId === academyId &&
      hasConfiguredBankAccounts(st.financeConfig)
    ) {
      const coll = readCollectionSettingsFromFinanceConfig(st.financeConfig);
      applyLoadedState(st.financeConfig, coll);
      setLoading(false);
      return;
    }
    void reloadFromServer();
  }, [academyId, applyLoadedState, reloadFromServer]);

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
    [academyId, isOwner, contractTemplatesConfigured, mutateEnsureContractSetup, applyEnsureSetupResult, addToast]
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
      accounts:
        digestBankAccounts(financeConfig.bankAccounts, financeConfig) !== savedDigests.accounts,
      fees: digestCardFees(financeConfig.cardFees) !== savedDigests.fees,
      plans: digestPlans(financeConfig.plans) !== savedDigests.plans,
      collection: digestCollection(collectionRules, overdueLabel) !== savedDigests.collection,
      exceptions: digestExceptionLabels(exceptionLabels) !== savedDigests.exceptions,
      whatsapp: digestWhatsappReminders(financeConfig.whatsappReminders) !== savedDigests.whatsapp,
      vendors: digestVendors(financeConfig.vendors) !== savedDigests.vendors,
    }),
    [financeConfig, collectionRules, overdueLabel, exceptionLabels, savedDigests]
  );

  const hasDirty = Object.values(dirty).some(Boolean);

  const saveValidation = useMemo(
    () => validateFinanceConfigBeforeSave({ financeConfig, isOwner }),
    [financeConfig, isOwner]
  );

  const saveValidationHint = useMemo(() => {
    if (saveValidation.ok || !hasDirty) return '';
    return formatFinanceConfigSaveError(saveValidation.issues);
  }, [saveValidation, hasDirty]);

  const saveValidationSection = useMemo(() => {
    if (saveValidation.ok || !hasDirty) return null;
    return firstFinanceConfigIssueSection(saveValidation.issues);
  }, [saveValidation, hasDirty]);

  const buildMergedConfig = useCallback(() => {
    let mergedCfg = mergeCollectionIntoFinanceConfig(financeConfig, {
      collectionRules,
      overdueLabel,
    });
    mergedCfg = mergeExceptionLabelsIntoFinanceConfig(mergedCfg, exceptionLabels);
    mergedCfg = mergeWhatsappRemindersIntoFinanceConfig({
      ...mergedCfg,
      bankAccounts: filterBankAccountsWithBank(mergedCfg.bankAccounts),
    });
    mergedCfg = {
      ...mergedCfg,
      defaultAccountByMethod: normalizeDefaultAccountByMethodMap(
        readDefaultAccountByMethod(mergedCfg),
        mergedCfg
      ),
      vendors: normalizeFinanceVendors(mergedCfg.vendors),
    };
    return mergedCfg;
  }, [financeConfig, collectionRules, overdueLabel, exceptionLabels]);

  const persistAll = useCallback(async () => {
    if (!academyId) return false;

    const validation = validateFinanceConfigBeforeSave({ financeConfig, isOwner });
    if (!validation.ok) {
      const message = formatFinanceConfigSaveError(validation.issues);
      addToast({ type: 'error', message });
      return false;
    }

    setSaving(true);
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
        accounts: digestBankAccounts(savedCfg.bankAccounts, savedCfg),
        fees: digestCardFees(savedCfg.cardFees),
        plans: digestPlans(savedCfg.plans),
        collection: digestCollection(coll.collectionRules, coll.overdueLabel),
        exceptions: digestExceptionLabels(labels),
        whatsapp: digestWhatsappReminders(savedCfg.whatsappReminders),
        vendors: digestVendors(savedCfg.vendors),
      });
      addToast({ type: 'success', message: 'Configurações financeiras salvas.' });
      return true;
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
      return false;
    } finally {
      setSaving(false);
    }
  }, [academyId, financeConfig, isOwner, buildMergedConfig, addToast]);

  const discardChanges = useCallback(() => {
    void reloadFromServer();
  }, [reloadFromServer]);

  const updatePlan = useCallback((idx, patch) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.plans || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...prev, plans: arr };
    });
  }, []);

  const addPlan = useCallback(() => {
    setFinanceConfig((prev) => ({
      ...prev,
      plans: [
        ...(prev.plans || []),
        {
          name: '',
          price: 0,
          description: '',
          applyCardFee: true,
        },
      ],
    }));
  }, []);

  const removePlan = useCallback((idx) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.plans || [])];
      arr.splice(idx, 1);
      return { ...prev, plans: arr };
    });
  }, []);

  const updateBankAccount = useCallback((idx, patch) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.bankAccounts || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...prev, bankAccounts: arr };
    });
  }, []);

  const addBankAccount = useCallback(() => {
    setFinanceConfig((prev) => ({
      ...prev,
      bankAccounts: [
        ...(prev.bankAccounts || []),
        {
          bankName: '',
          branch: '',
          account: '',
          accountName: '',
          pixKey: '',
          openingBalance: 0,
          openingBalanceDate: '',
        },
      ],
    }));
  }, []);

  const removeBankAccount = useCallback((idx) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.bankAccounts || [])];
      arr.splice(idx, 1);
      return { ...prev, bankAccounts: arr };
    });
  }, []);

  const updateVendor = useCallback((idx, patch) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.vendors || [])];
      arr[idx] = { ...(arr[idx] || {}), ...patch };
      return { ...prev, vendors: arr };
    });
  }, []);

  const addVendor = useCallback(() => {
    setFinanceConfig((prev) => ({
      ...prev,
      vendors: [
        ...(prev.vendors || []),
        {
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `v_${Date.now()}`,
          name: '',
          active: true,
        },
      ],
    }));
  }, []);

  const removeVendor = useCallback((idx) => {
    setFinanceConfig((prev) => {
      const arr = [...(prev.vendors || [])];
      arr.splice(idx, 1);
      return { ...prev, vendors: arr };
    });
  }, []);

  return {
    loading,
    saving,
    financeConfig,
    setFinanceConfig,
    collectionRules,
    setCollectionRules,
    overdueLabel,
    setOverdueLabel,
    exceptionLabels,
    setExceptionLabels,
    dirty,
    hasDirty,
    saveValidationHint,
    saveValidationSection,
    persistAll,
    discardChanges,
    updatePlan,
    addPlan,
    removePlan,
    updateBankAccount,
    addBankAccount,
    removeBankAccount,
    pendingRemovePlan,
    setPendingRemovePlan,
    pendingRemoveBank,
    setPendingRemoveBank,
    pendingRemoveVendor,
    setPendingRemoveVendor,
    updateVendor,
    addVendor,
    removeVendor,
    contractTemplates,
    contractTemplatesConfigured,
    runEnsureContractSetup,
    ensureContractSetup,
  };
}
