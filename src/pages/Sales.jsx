import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';
import NlCommandBar, { NlCommandBarTrigger } from '../components/NlCommandBar';
import { useLeadStore } from '../store/useLeadStore';

const Sales = () => {
  const [searchParams] = useSearchParams();
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const [nlOpen, setNlOpen] = useState(false);
  const academyName = useMemo(() => {
    const cur = (academyList || []).find((a) => a.id === academyId);
    return String(cur?.name || '').trim();
  }, [academyList, academyId]);
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return t === 'history' || t === 'historico' ? 'history' : 'new';
  });

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'history' || t === 'historico') setTab('history');
  }, [searchParams]);

  return (
    <div className="container sales-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Vendas</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>
          {tab === 'new' ? 'Catálogo, carrinho e comprovante' : 'Histórico e cancelamentos'}
        </p>
        <div className="page-header-card" style={{ marginTop: 12 }}>
          <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
        </div>
      </div>

      <div className="sales-page-tabs mt-4" role="tablist" aria-label="Vendas">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'new'}
          className={`sales-page-tab${tab === 'new' ? ' sales-page-tab--active' : ''}`}
          onClick={() => setTab('new')}
        >
          Nova venda
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`sales-page-tab${tab === 'history' ? ' sales-page-tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          Histórico
        </button>
      </div>

      {tab === 'new' ? <SalesNewSaleTab /> : <SalesHistoryTab onSwitchTab={setTab} />}
      <NlCommandBar
        open={nlOpen}
        onOpenChange={setNlOpen}
        academyName={academyName}
        context="vendas"
      />
    </div>
  );
};

export default Sales;
