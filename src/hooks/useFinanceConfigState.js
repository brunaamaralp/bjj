import { useEffect, useMemo, useState, useCallback } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages';
import {
  readExceptionStatusLabels,
  mergeExceptionLabelsIntoFinanceConfig,
} from '../lib/paymentExceptions.js';
import { useContractTemplates } from '../features/contracts/queries.js';
import {
  defaultTemplateForPurpose,
  validateFinancePlansContractTemplates,
  CONTRACT_TEMPLATE_PURPOSE_LABELS,
} from '../lib/contractPlanTemplates.js';
import { useEnsureAcademyContractSetup } from '../features/contracts/queries.js';
import {
  serializeCollectionRules,
  parseOverdueLabel,
  DEFAULT_COLLECTION_RULES,
  readCollectionSettingsFromFinanceConfig,
  readCollectionSettingsFromAcademy,
  mergeCollectionIntoFinanceConfig,
} from '../lib/collectionRules.js';
import { filterBankAccountsWithBank } from '../lib/bankAccounts.js';
import {
  defaultWhatsappRemindersConfig,
  digestWhatsappReminders,
  mergeWhatsappRemindersIntoFinanceConfig,
} from '../lib/financeWhatsappReminders.js';

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
  bankAccounts: [],
  plans: [],
  whatsappReminders: defaultWhatsappRemindersConfig(),
});

export function digestBankAccounts(accounts) {
  return JSON.stringify(accounts || []);
}

export function digestCardFees(cardFees) {
  return JSON.stringify(cardFees || {});
}

export function digestPlans(plans) {
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
  const contractTemplates = contractTemplatesData?.templates || [];
  const contractTemplatesConfigured =
    contractTemplatesReady && contractTemplatesData?.configured !== false;
  const ensureContractSetup = useEnsureAcademyContractSetup();

  const [loading, setLoading] = useState(Boolean(academyId));
  const [saving, setSaving] = useState(false);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [collectionRules, setCollectionRules] = useState(() => DEFAULT_COLLECTION_RULES.map((r) => ({ ...r })));
  const [overdueLabel, setOverdueLabel] = useState('Inadimplente');
  const [exceptionLabels, setExceptionLabels] = useState(() => readExceptionStatusLabels(null));
  const [pendingRemovePlan, setPendingRemovePlan] = useState(null);
  const [pendingRemoveBank, setPendingRemoveBank] = useState(null);

  const [savedDigests, setSavedDigests] = useState({
    accounts: digestBankAccounts([]),
    fees: digestCardFees(defaultFinanceConfig().cardFees),
    plans: digestPlans([]),
    collection: digestCollection(DEFAULT_COLLECTION_RULES, 'Inadimplente'),
    exceptions: digestExceptionLabels(readExceptionStatusLabels(null)),
    whatsapp: digestWhatsappReminders(defaultWhatsappRemindersConfig()),
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
      accounts: digestBankAccounts(cfg.bankAccounts),
      fees: digestCardFees(cfg.cardFees),
      plans: digestPlans(cfg.plans),
      collection: digestCollection(coll.collectionRules, coll.overdueLabel),
      exceptions: digestExceptionLabels(labels),
      whatsapp: digestWhatsappReminders(cfg.whatsappReminders),
    });
  }, []);

  const reloadFromServer = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
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
    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {
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

  const runEnsureContractSetup = useCallback(
    async ({ showToast = true } = {}) => {
      if (!academyId || !isOwner || !contractTemplatesConfigured) return null;
      try {
        const result = await ensureContractSetup.mutateAsync();
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
    [academyId, isOwner, contractTemplatesConfigured, ensureContractSetup, applyEnsureSetupResult, addToast]
  );

  useEffect(() => {
    if (!isOwner || !academyId || !contractTemplatesConfigured) return;
    const key = `contractSetupEnsured:${academyId}`;
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(key)) return;
    void runEnsureContractSetup({ showToast: true }).then((result) => {
      if (result && typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(key, '1');
      }
    });
  }, [isOwner, academyId, contractTemplatesConfigured, runEnsureContractSetup]);

  const dirty = useMemo(
    () => ({
      accounts: digestBankAccounts(financeConfig.bankAccounts) !== savedDigests.accounts,
      fees: digestCardFees(financeConfig.cardFees) !== savedDigests.fees,
      plans: digestPlans(financeConfig.plans) !== savedDigests.plans,
      collection: digestCollection(collectionRules, overdueLabel) !== savedDigests.collection,
      exceptions: digestExceptionLabels(exceptionLabels) !== savedDigests.exceptions,
      whatsapp: digestWhatsappReminders(financeConfig.whatsappReminders) !== savedDigests.whatsapp,
    }),
    [financeConfig, collectionRules, overdueLabel, exceptionLabels, savedDigests]
  );

  const hasDirty = Object.values(dirty).some(Boolean);

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
    return mergedCfg;
  }, [financeConfig, collectionRules, overdueLabel, exceptionLabels]);

  const persistAll = useCallback(async () => {
    if (!academyId) return false;
    if (dirty.plans) {
      const { ok, missing } = validateFinancePlansContractTemplates(financeConfig, contractTemplates);
      if (!ok) {
        const lines = missing.map((m) => {
          const label = m.kind === 'rescission' ? 'termo de rescisão' : 'contrato de matrícula';
          return `${m.planName} (${label})`;
        });
        addToast({
          type: 'error',
          message: `Defina o documento de cada plano: ${lines.join(', ')}.`,
        });
        return false;
      }
    }
    setSaving(true);
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
        whatsapp: digestWhatsappReminders(mergedCfg.whatsappReminders),
      });
      addToast({ type: 'success', message: 'Configurações financeiras salvas.' });
      return true;
    } catch (e) {
      console.error(e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
      return false;
    } finally {
      setSaving(false);
    }
  }, [academyId, dirty.plans, financeConfig, contractTemplates, buildMergedConfig, addToast]);

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
    setFinanceConfig((prev) => {
      const arr = [...(prev.plans || [])];
      const defEnrollment = defaultTemplateForPurpose(contractTemplates, 'enrollment');
      const defRescission = defaultTemplateForPurpose(contractTemplates, 'rescission');
      arr.push({
        name: '',
        price: 0,
        durationDays: 30,
        description: '',
        applyCardFee: true,
        contractTemplateId: defEnrollment?.$id,
        rescissionTemplateId: defRescission?.$id,
      });
      return { ...prev, plans: arr };
    });
  }, [contractTemplates]);

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
    contractTemplates,
    contractTemplatesConfigured,
    runEnsureContractSetup,
    ensureContractSetup,
  };
}
