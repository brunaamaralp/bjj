import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useLeadStore } from '../store/useLeadStore';
import {
  INTEGRACOES_DEFAULT_SECTION,
  INTEGRACOES_SETTINGS_ITEMS,
  INTEGRACOES_SETTINGS_SECTIONS,
  isIntegracoesSettingsSection,
  resolveIntegracoesNavState,
} from '../lib/integracoesSettingsSections.js';
import ControlIdCatracaSection from '../components/academy/ControlIdCatracaSection.jsx';
import ContractsAutentiqueSection from '../components/academy/ContractsAutentiqueSection.jsx';
import IntegracoesPagBankSection from '../components/academy/IntegracoesPagBankSection.jsx';
import IntegracoesWhatsAppSection from '../components/academy/IntegracoesWhatsAppSection.jsx';
import AcademyTabSettingsLayout from '../components/academy/settings/AcademyTabSettingsLayout.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import '../components/finance/finance.css';

export default function Integracoes() {
  const academyId = useLeadStore((s) => s.academyId);
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const navState = resolveIntegracoesNavState(rawTab);
  const activeTab = navState.section;
  const sectionMeta = navState.meta;

  useEffect(() => {
    const resolved = isIntegracoesSettingsSection(rawTab);
    const target = resolved || INTEGRACOES_DEFAULT_SECTION;
    if (String(rawTab || '').trim().toLowerCase() !== target) {
      setSearchParams({ tab: target }, { replace: true });
    }
  }, [rawTab, setSearchParams]);

  const setTab = (id) => setSearchParams({ tab: id }, { replace: false });

  let sectionBody = null;
  if (!academyId) {
    sectionBody = (
      <p className="text-small text-muted">Selecione uma academia para configurar integrações.</p>
    );
  } else if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.WHATSAPP) {
    sectionBody = <IntegracoesWhatsAppSection embeddedInLayout academyId={academyId} />;
  } else if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.CATRACA) {
    sectionBody = <ControlIdCatracaSection embeddedInLayout academyId={academyId} />;
  } else if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.AUTENTIQUE) {
    sectionBody = <ContractsAutentiqueSection embeddedInLayout academyId={academyId} />;
  } else if (activeTab === INTEGRACOES_SETTINGS_SECTIONS.PAGBANK) {
    sectionBody = <IntegracoesPagBankSection embeddedInLayout academyId={academyId} />;
  }

  return (
    <div className="container navi-hub-page integracoes-hub-page">
      <PageHeader
        title="Integrações"
        subtitle="WhatsApp, catraca Control iD, assinatura digital Autentique e cobrança recorrente PagBank."
      />

      <section className="integracoes-settings-section animate-in mt-3">
        <AcademyTabSettingsLayout
          navLabel="Integrações"
          items={INTEGRACOES_SETTINGS_ITEMS}
          activeId={activeTab}
          onSelect={setTab}
          title={sectionMeta?.panelTitle}
          subtitle={sectionMeta?.hint}
        >
          {sectionBody}
        </AcademyTabSettingsLayout>
      </section>
    </div>
  );
}
