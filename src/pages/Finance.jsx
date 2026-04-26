import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ID, Query } from 'appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { useAccountingStore } from '../store/useAccountingStore';
import { useUiStore } from '../store/useUiStore';
import { databases, DB_ID, ACCOUNTS_COL, ACADEMIES_COL } from '../lib/appwrite';
import AccountsTab from '../components/finance/AccountsTab.jsx';
import JournalTab from '../components/finance/JournalTab.jsx';
import ReportsTab from '../components/finance/ReportsTab.jsx';
import ImportFinanceModal from '../components/finance/ImportFinanceModal.jsx';
import { FINANCE_PAGE_CSS } from '../components/finance/financePageStyles.js';

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

const Finance = () => {
  const addToast = useUiStore((s) => s.addToast);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  const accounts = useAccountingStore((s) => s.accounts);
  const setAccounts = useAccountingStore((s) => s.setAccounts);
  const addAccount = useAccountingStore((s) => s.addAccount);
  const updateAccount = useAccountingStore((s) => s.updateAccount);
  const deleteAccount = useAccountingStore((s) => s.deleteAccount);
  const journal = useAccountingStore((s) => s.journal);
  const setJournal = useAccountingStore((s) => s.setJournal);
  const addEntry = useAccountingStore((s) => s.addEntry);
  const deleteEntry = useAccountingStore((s) => s.deleteEntry);

  const [tab, setTab] = useState('plano');
  const [showImportModal, setShowImportModal] = useState(false);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [hasAccountsInDb, setHasAccountsInDb] = useState(false);

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  useEffect(() => {
    if (!academyId) {
      setFinanceConfig(defaultFinanceConfig());
      setHasAccountsInDb(false);
      return;
    }
    let active = true;

    databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
      .then((doc) => {
        if (!active) return;
        let cfg = defaultFinanceConfig();
        try {
          const parsed = doc.financeConfig
            ? (typeof doc.financeConfig === 'string' ? JSON.parse(doc.financeConfig) : doc.financeConfig)
            : null;
          if (parsed && typeof parsed === 'object') cfg = { ...cfg, ...parsed };
        } catch {
          void 0;
        }
        setFinanceConfig(cfg);
      })
      .catch(() => {
        if (!active) return;
        setFinanceConfig(defaultFinanceConfig());
      });

    if (ACCOUNTS_COL) {
      databases.listDocuments(DB_ID, ACCOUNTS_COL, [Query.equal('academyId', academyId), Query.limit(1)])
        .then((res) => {
          if (!active) return;
          setHasAccountsInDb((res.documents || []).length > 0);
        })
        .catch(() => {
          if (!active) return;
          setHasAccountsInDb(false);
        });
    } else {
      setHasAccountsInDb(false);
    }

    return () => { active = false; };
  }, [academyId]);

  const hasExistingData = hasAccountsInDb
    || (financeConfig.plans?.length || 0) > 0
    || (financeConfig.bankAccounts?.length || 0) > 0;

  const handleImportFinance = useCallback(async ({ accounts: newAccounts, plans: newPlans, bankAccounts: newBankAccounts, mode }) => {
    if (!academyId) throw new Error('Selecione uma academia para importar.');
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
          (existing.documents || []).map((d) =>
            databases.deleteDocument(DB_ID, ACCOUNTS_COL, d.$id)
          )
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
        updatedConfig.plans = mode === 'replace'
          ? plansList
          : [...(financeConfig.plans || []), ...plansList];
      }

      if (banksList.length > 0) {
        updatedConfig.bankAccounts = mode === 'replace'
          ? banksList
          : [...(financeConfig.bankAccounts || []), ...banksList];
      }

      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        financeConfig: JSON.stringify(updatedConfig),
      });
      setFinanceConfig(updatedConfig);
    }

    addToast({ type: 'success', message: 'Dados importados com sucesso.' });
  }, [academyId, financeConfig, setAccounts, addToast]);

  return (
    <div className="finance-page-root">
      <div className="finance-page-inner">
        <div className="animate-in">
          <h1 className="navi-page-title">Contabilidade</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 14 }}>
            Plano de contas, lançamentos e demonstrações{academyName ? ` · ${academyName}` : ''}
          </p>
        </div>

        {!String(academyId || '').trim() ? (
          <div style={{ padding: 24, color: 'var(--text-secondary)', fontSize: 13 }}>
            Selecione uma academia para visualizar os dados.
          </div>
        ) : (
          <>
            <div className="finance-tabs" role="tablist" aria-label="Contabilidade">
              <button type="button" role="tab" aria-selected={tab === 'plano'} className={`finance-tab ${tab === 'plano' ? 'finance-tab--active' : ''}`} onClick={() => setTab('plano')}>Plano de Contas</button>
              <button type="button" role="tab" aria-selected={tab === 'lancamentos'} className={`finance-tab ${tab === 'lancamentos' ? 'finance-tab--active' : ''}`} onClick={() => setTab('lancamentos')}>Lançamentos</button>
              <button type="button" role="tab" aria-selected={tab === 'relatorios'} className={`finance-tab ${tab === 'relatorios' ? 'finance-tab--active' : ''}`} onClick={() => setTab('relatorios')}>DRE / DFC</button>
            </div>

            {tab === 'plano' && (
              <AccountsTab
                academyId={academyId}
                accounts={accounts}
                setAccounts={setAccounts}
                addAccount={addAccount}
                updateAccount={updateAccount}
                deleteAccount={deleteAccount}
                headingActions={(
                  <button
                    type="button"
                    className="btn-action-ghost"
                    onClick={() => setShowImportModal(true)}
                  >
                    ↑ Importar planilha
                  </button>
                )}
              />
            )}
            {tab === 'lancamentos' && (
              <JournalTab
                academyId={academyId}
                accounts={accounts}
                journal={journal}
                setJournal={setJournal}
                addEntry={addEntry}
                deleteEntry={deleteEntry}
              />
            )}
            {tab === 'relatorios' && (
              <ReportsTab academyId={academyId} onGoToLancamentos={() => setTab('lancamentos')} />
            )}
          </>
        )}
      </div>
      <ImportFinanceModal
        open={showImportModal}
        onClose={() => setShowImportModal(false)}
        onConfirm={handleImportFinance}
        academyId={academyId}
        academyName={academyName}
        hasExistingData={hasExistingData}
      />
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
    </div>
  );
};

export default Finance;
