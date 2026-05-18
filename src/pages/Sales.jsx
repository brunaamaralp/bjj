import React, { useState } from 'react';
import SalesNewSaleTab from '../components/sales/SalesNewSaleTab';
import SalesHistoryTab from '../components/sales/SalesHistoryTab';

const Sales = () => {
  const [tab, setTab] = useState('new');

  return (
    <div className="container sales-page" style={{ paddingTop: 20, paddingBottom: 20 }}>
      <div className="animate-in">
        <h1 className="navi-page-title">Vendas</h1>
        <p className="navi-eyebrow" style={{ marginTop: 6 }}>
          {tab === 'new' ? 'Catálogo, carrinho e comprovante' : 'Histórico e cancelamentos'}
        </p>
      </div>

      <div className="finance-tabs mt-4" role="tablist" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'new'}
          className={`finance-tab${tab === 'new' ? ' finance-tab--active' : ''}`}
          onClick={() => setTab('new')}
        >
          Nova venda
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'history'}
          className={`finance-tab${tab === 'history' ? ' finance-tab--active' : ''}`}
          onClick={() => setTab('history')}
        >
          Histórico
        </button>
      </div>

      {tab === 'new' ? <SalesNewSaleTab /> : <SalesHistoryTab />}
    </div>
  );
};

export default Sales;

