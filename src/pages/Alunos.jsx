import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveHubTab } from '../lib/hubTabs';
import HubTabBar from '../components/shared/HubTabBar';
import ContractsPageContent from '../components/contracts/ContractsPageContent';
import PageHeader from '../components/layout/PageHeader.jsx';
import Students from './Students';
import { useLeadStore } from '../store/useLeadStore';
import { useTerms } from '../lib/terminology';

const TAB_LISTA = 'lista';
const TAB_CONTRATOS = 'contratos';

export default function Alunos() {
  const modules = useLeadStore((s) => s.modules);
  const financeOn = modules?.finance === true;
  const terms = useTerms();
  const studentPlural = terms.students;

  const allowedTabs = useMemo(() => {
    const set = new Set([TAB_LISTA]);
    if (financeOn) set.add(TAB_CONTRATOS);
    return set;
  }, [financeOn]);

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const activeTab = resolveHubTab(rawTab, allowedTabs, TAB_LISTA);

  useEffect(() => {
    const t = String(searchParams.get('tab') || '').trim().toLowerCase();
    if (!allowedTabs.has(t)) {
      setSearchParams({ tab: activeTab }, { replace: true });
    }
  }, [activeTab, allowedTabs, searchParams, setSearchParams]);

  const tabs = useMemo(() => {
    const items = [{ id: TAB_LISTA, label: 'Lista' }];
    if (financeOn) items.push({ id: TAB_CONTRATOS, label: 'Contratos' });
    return items;
  }, [financeOn]);

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  const hubSubtitle =
    activeTab === TAB_CONTRATOS
      ? 'Contratos digitais para assinatura via Autentique.'
      : `Consulte cadastro, planos e status dos ${studentPlural.toLowerCase()}.`;

  const hubMeta =
    activeTab === TAB_CONTRATOS
      ? 'Assinatura via Autentique'
      : `Lista de ${studentPlural.toLowerCase()} matriculados`;

  return (
    <div className="container navi-hub-page students-hub-page" style={{ paddingBottom: 40 }}>
      <PageHeader
        className="navi-hub-page__head"
        title={studentPlural}
        subtitle={hubSubtitle}
        meta={hubMeta}
      />
      <HubTabBar tabs={tabs} activeId={activeTab} onChange={setTab} ariaLabel={studentPlural} fullWidth />
      <div className="navi-hub-page__body">
        {activeTab === TAB_LISTA ? <Students embedded /> : null}
        {activeTab === TAB_CONTRATOS && financeOn ? <ContractsPageContent embedded /> : null}
      </div>
    </div>
  );
}
