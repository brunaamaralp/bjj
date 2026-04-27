import React, { useEffect, useMemo, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { useLeadStore } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { friendlyError } from '../lib/errorMessages';
import TransacoesTab from '../components/finance/TransacoesTab.jsx';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
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

export default function Caixa() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const addToast = useUiStore((s) => s.addToast);
  const [financeConfig, setFinanceConfig] = useState(defaultFinanceConfig);
  const [nlOpen, setNlOpen] = useState(false);
  const [transactionsForNl, setTransactionsForNl] = useState([]);

  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);

  useEffect(() => {
    if (!academyId) return;
    const st = useLeadStore.getState();
    if (st.financeConfig != null && st.financeConfigAcademyId === academyId) {
      setFinanceConfig(st.financeConfig);
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
        if (loadAid !== useLeadStore.getState().academyId) return;
        setFinanceConfig(cfg);
        useLeadStore.getState().setFinanceConfig(cfg);
      })
      .catch((e) => {
        console.error(e);
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      });
  }, [academyId]);

  return (
    <div className="finance-page-root">
      <div className="finance-page-inner">
        <div className="animate-in">
          <h1 className="navi-page-title">Caixa</h1>
          <p className="navi-eyebrow" style={{ marginTop: 6, marginBottom: 14 }}>
            Lançamentos e movimentações financeiras{academyName ? ` · ${academyName}` : ''}
          </p>
          <div className="page-header-card">
            <div className="page-header-row">
              <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
              <div style={{ flex: 1 }} />
            </div>
          </div>
        </div>
        {academyId ? (
          <TransacoesTab
            academyId={academyId}
            financeConfig={financeConfig}
            onTransactionsChange={setTransactionsForNl}
          />
        ) : null}
      </div>
      <style dangerouslySetInnerHTML={{ __html: FINANCE_PAGE_CSS }} />
      <NlCommandBar
        open={nlOpen}
        onOpenChange={setNlOpen}
        academyName={academyName}
        pendingTransactions={transactionsForNl}
      />
    </div>
  );
}
