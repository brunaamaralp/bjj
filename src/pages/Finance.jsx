import React, { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore';
import { useAccountingStore } from '../store/useAccountingStore';
import AccountsTab from '../components/finance/AccountsTab.jsx';
import JournalTab from '../components/finance/JournalTab.jsx';
import ReportsTab from '../components/finance/ReportsTab.jsx';
import { FINANCE_PAGE_CSS } from '../components/finance/financePageStyles.js';

const Finance = () => {
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

  useEffect(() => {
    if (academyId) useAccountingStore.getState().loadByAcademy(academyId);
  }, [academyId]);

  return (
    <div className="finance-page-root">
      <div className="finance-page-inner">
        <div className="animate-in">
          <h1 className="navi-page-title">Contabilidade</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6 }}>
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
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
    </div>
  );
};

export default Finance;
