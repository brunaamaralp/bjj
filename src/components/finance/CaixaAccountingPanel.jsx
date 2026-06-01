import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ID, Query } from 'appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useAccountingStore } from '../../store/useAccountingStore';
import { useUiStore } from '../../store/useUiStore';
import { databases, DB_ID, ACCOUNTS_COL, ACADEMIES_COL } from '../../lib/appwrite';
import AccountsTab from './AccountsTab.jsx';
import JournalTab from './JournalTab.jsx';
import ImportFinanceModal from './ImportFinanceModal.jsx';
import { useTerms } from '../../lib/terminology.js';
import { exportAccountsCsv } from '../../lib/exportAccountsCsv.js';
import StatusBanner from '../shared/StatusBanner.jsx';

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

const mapAccountDoc = (d) => ({
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

/**
 * Painel contábil owner.
 * @param {'settings' | 'operational'} scope — plano de contas vs extrato/lançamentos
 */
export default function CaixaAccountingPanel({ scope = 'settings', isOwner = true }) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);

  const accounts = useAccountingStore((s) => s.accounts);
  const setAccounts = useAccountingStore((s) => s.setAccounts);
  const addAccount = useAccountingStore((s) => s.addAccount);
  const updateAccount = useAccountingStore((s) => s.updateAccount);
  const deleteAccount = useAccountingStore((s) => s.deleteAccount);
  const journal = useAccountingStore((s) => s.journal);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const addEntry = useAccountingStore((s) => s.addEntry);
  const deleteEntry = useAccountingStore((s) => s.deleteEntry);

  const [showImportModal, setShowImportModal] = useState(false);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [hasAccountsInDb, setHasAccountsInDb] = useState(false);

  const academyName = useMemo(() => {
    const list = useLeadStore.getState().academyList || [];
    const cur = list.find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyId]);

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  useEffect(() => {
    if (!academyId) return;
    let active = true;
    const st = useLeadStore.getState();
    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {
      Promise.resolve().then(() => {
        if (active) setFinanceConfig(st.financeConfig);
      });
    } else {
      const loadAid = academyId;
      databases
        .getDocument(DB_ID, ACADEMIES_COL, academyId)
        .then((doc) => {
          if (!active || loadAid !== useLeadStore.getState().academyId) return;
          let cfg = defaultFinanceConfig();
          try {
            const parsed = doc.financeConfig
              ? typeof doc.financeConfig === 'string'
                ? JSON.parse(doc.financeConfig)
                : doc.financeConfig
              : null;
            if (parsed && typeof parsed === 'object') cfg = { ...cfg, ...parsed };
          } catch {
            void 0;
          }
          setFinanceConfig(cfg);
          useLeadStore.getState().setFinanceConfig(cfg);
        })
        .catch(() => {
          if (active) setFinanceConfig(defaultFinanceConfig());
        });
    }

    if (ACCOUNTS_COL) {
      databases
        .listDocuments(DB_ID, ACCOUNTS_COL, [Query.equal('academyId', academyId), Query.limit(1)])
        .then((res) => {
          if (active) setHasAccountsInDb((res.documents || []).length > 0);
        })
        .catch(() => {
          if (active) setHasAccountsInDb(false);
        });
    }

    return () => {
      active = false;
    };
  }, [academyId]);

  const hasExistingData =
    hasAccountsInDb || (financeConfig.plans?.length || 0) > 0 || (financeConfig.bankAccounts?.length || 0) > 0;

  const handleImportFinance = useCallback(
    async ({ accounts: newAccounts, plans: newPlans, bankAccounts: newBankAccounts, mode }) => {
      if (!academyId) throw new Error(`Selecione uma ${terms.workspaceNoun} para importar.`);
      const accountsList = Array.isArray(newAccounts) ? newAccounts : [];
      const plansList = Array.isArray(newPlans) ? newPlans : [];
      const banksList = Array.isArray(newBankAccounts) ? newBankAccounts : [];

      if (accountsList.length > 0 && ACCOUNTS_COL) {
        if (mode === 'replace') {
          const existing = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
            Query.equal('academyId', academyId),
            Query.limit(500),
          ]);
          await Promise.allSettled(
            (existing.documents || []).map((d) => databases.deleteDocument(DB_ID, ACCOUNTS_COL, d.$id))
          );
        }
        await Promise.allSettled(
          accountsList.map((account) =>
            databases.createDocument(DB_ID, ACCOUNTS_COL, ID.unique(), {
              academyId,
              code: String(account?.code || '').trim(),
              name: String(account?.name || '').trim(),
              type: String(account?.type || 'ativo').trim().toLowerCase(),
              nature: String(account?.nature || 'devedora').trim().toLowerCase(),
              dreGrupo: String(account?.dreGrupo || '').trim(),
              dfcClasse: String(account?.dfcClasse || '').trim(),
              dfcSubclasse: String(account?.dfcSubclasse || '').trim(),
              cash: Boolean(account?.cash),
            })
          )
        );
        const refreshed = await databases.listDocuments(DB_ID, ACCOUNTS_COL, [
          Query.equal('academyId', academyId),
          Query.limit(500),
          Query.orderAsc('code'),
        ]);
        setAccounts((refreshed.documents || []).map(mapAccountDoc));
        setHasAccountsInDb((refreshed.documents || []).length > 0);
      }

      if (plansList.length > 0 || banksList.length > 0) {
        const updatedConfig = { ...financeConfig };
        if (plansList.length > 0) {
          updatedConfig.plans = mode === 'replace' ? plansList : [...(financeConfig.plans || []), ...plansList];
        }
        if (banksList.length > 0) {
          updatedConfig.bankAccounts =
            mode === 'replace' ? banksList : [...(financeConfig.bankAccounts || []), ...banksList];
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          financeConfig: JSON.stringify(updatedConfig),
        });
        setFinanceConfig(updatedConfig);
        useLeadStore.getState().setFinanceConfig(updatedConfig);
      }

      addToast({ type: 'success', message: 'Dados importados com sucesso.' });
    },
    [academyId, financeConfig, setAccounts, addToast, terms.workspaceNoun]
  );

  if (!String(academyId || '').trim()) {
    return (
      <div className="finance-accounting-empty">
        Selecione uma {terms.workspaceNoun} para visualizar os dados.
      </div>
    );
  }

  const showPlano = isOwner && scope === 'settings';
  const showExtrato = scope === 'operational';

  return (
    <>
      {showPlano ? (
        <section id="finance-plano-contas" className="finance-config-section finance-config-section--accounting">
          <AccountsTab
            academyId={academyId}
            accounts={accounts}
            setAccounts={setAccounts}
            addAccount={addAccount}
            updateAccount={updateAccount}
            deleteAccount={deleteAccount}
            headingActions={
              <>
                <button
                  type="button"
                  className="btn-action-ghost"
                  disabled={!accounts?.length}
                  onClick={() => exportAccountsCsv(accounts)}
                >
                  ↓ Exportar plano
                </button>
                <button type="button" className="btn-action-ghost" onClick={() => setShowImportModal(true)}>
                  ↑ Importar planilha
                </button>
              </>
            }
          />
          <hr className="finance-config-section__divider" aria-hidden />
        </section>
      ) : null}
      {showExtrato ? (
        <section id="finance-extrato" className="finance-config-section finance-config-section--accounting">
          <StatusBanner variant="info" className="finance-tab-intro">
            Visão contábil por conta: lançamentos gerados pelo Caixa e por mensalidades aparecem aqui conforme o plano
            de contas. Para operação do dia a dia, use Caixa e Mensalidades.
          </StatusBanner>
          <JournalTab
            academyId={academyId}
            accounts={accounts}
            journal={journal}
            setJournal={setJournal}
            addEntry={addEntry}
            deleteEntry={deleteEntry}
            sectionTitle="Extrato por conta"
          />
        </section>
      ) : null}
      {showPlano ? (
        <ImportFinanceModal
          open={showImportModal}
          onClose={() => setShowImportModal(false)}
          onConfirm={handleImportFinance}
          academyId={academyId}
          academyName={academyName}
          hasExistingData={hasExistingData}
        />
      ) : null}
    </>
  );
}
