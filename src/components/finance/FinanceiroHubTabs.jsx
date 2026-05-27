import React, { useMemo } from 'react';
import HubTabBar from '../shared/HubTabBar.jsx';
import {
  FINANCEIRO_SECTIONS,
  FINANCEIRO_CAIXA_LEAF_TABS,
  FINANCEIRO_CONTABILIDADE_LEAF_TABS,
  getFinanceiroSectionForTab,
} from '../../lib/financeiroHubTabs.js';

const TOP_TABS = [
  { id: FINANCEIRO_SECTIONS.OVERVIEW, label: 'Visão Geral' },
  { id: FINANCEIRO_SECTIONS.MENSALIDADES, label: 'Mensalidades' },
  { id: FINANCEIRO_SECTIONS.CAIXA, label: 'Caixa' },
  { id: FINANCEIRO_SECTIONS.CONTABILIDADE, label: 'Contabilidade' },
  { id: FINANCEIRO_SECTIONS.CONFIG, label: 'Configuração' },
];

const CAIXA_LEAF_LABELS = {
  movimentacoes: 'Movimentações',
  previsao: 'Previsão',
  fechamento: 'Fechamento mensal',
  conciliacao: 'Conciliação',
};

const CONTABILIDADE_LEAF_LABELS = {
  plano: 'Plano de contas',
  razao: 'Razão',
  dre: 'DRE / DFC',
};

/**
 * Navegação em dois níveis do hub Financeiro.
 * @param {string} activeLeafTab — slug em ?tab= (folha ou placeholder)
 * @param {(leafTab: string) => void} onLeafChange
 * @param {{ isOwner: boolean, financeModule: boolean }} access
 */
export default function FinanceiroHubTabs({ activeLeafTab, onLeafChange, access }) {
  const activeSection = getFinanceiroSectionForTab(activeLeafTab);

  const topTabs = useMemo(() => {
    if (access?.isOwner) return TOP_TABS;
    return TOP_TABS.filter(
      (t) =>
        t.id !== FINANCEIRO_SECTIONS.CONTABILIDADE && t.id !== FINANCEIRO_SECTIONS.CONFIG
    );
  }, [access?.isOwner]);

  const caixaLeafTabs = useMemo(() => {
    const ids = ['movimentacoes'];
    if (access?.financeModule) ids.push('previsao', 'fechamento');
    if (access?.isOwner && access?.financeModule) ids.push('conciliacao');
    return ids.map((id) => ({ id, label: CAIXA_LEAF_LABELS[id] || id }));
  }, [access?.financeModule, access?.isOwner]);

  const contabilidadeLeafTabs = useMemo(
    () =>
      FINANCEIRO_CONTABILIDADE_LEAF_TABS.map((id) => ({
        id,
        label: CONTABILIDADE_LEAF_LABELS[id] || id,
      })),
    []
  );

  const onTopChange = (sectionId) => {
    if (sectionId === FINANCEIRO_SECTIONS.CAIXA) {
      onLeafChange('movimentacoes');
      return;
    }
    if (sectionId === FINANCEIRO_SECTIONS.CONTABILIDADE) {
      onLeafChange('plano');
      return;
    }
    onLeafChange(sectionId);
  };

  return (
    <div className="financeiro-hub-tabs">
      <HubTabBar
        tabs={topTabs}
        activeId={activeSection}
        onChange={onTopChange}
        ariaLabel="Financeiro"
        className="financeiro-hub-tabs__primary"
      />
      {activeSection === FINANCEIRO_SECTIONS.CAIXA && caixaLeafTabs.length > 0 ? (
        <HubTabBar
          tabs={caixaLeafTabs}
          activeId={FINANCEIRO_CAIXA_LEAF_TABS.includes(activeLeafTab) ? activeLeafTab : 'movimentacoes'}
          onChange={onLeafChange}
          ariaLabel="Caixa"
          className="financeiro-hub-tabs__secondary navi-hub-tabs--nested"
        />
      ) : null}
      {activeSection === FINANCEIRO_SECTIONS.CONTABILIDADE && access?.isOwner ? (
        <HubTabBar
          tabs={contabilidadeLeafTabs}
          activeId={
            FINANCEIRO_CONTABILIDADE_LEAF_TABS.includes(activeLeafTab) ? activeLeafTab : 'plano'
          }
          onChange={onLeafChange}
          ariaLabel="Contabilidade"
          className="financeiro-hub-tabs__secondary navi-hub-tabs--nested"
        />
      ) : null}
    </div>
  );
}
