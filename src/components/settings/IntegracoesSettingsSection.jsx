import React from 'react';
import { useLeadStore } from '../../store/useLeadStore';
import {
  INTEGRACOES_DEFAULT_SECTION,
  INTEGRACOES_SETTINGS_ITEMS,
  INTEGRACOES_SETTINGS_SECTIONS,
  isIntegracoesSettingsSection,
} from '../../lib/integracoesSettingsSections.js';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import AcademyTabSettingsLayout from '../academy/settings/AcademyTabSettingsLayout.jsx';
import ControlIdCatracaSection from '../academy/ControlIdCatracaSection.jsx';
import ContractsAutentiqueSection from '../academy/ContractsAutentiqueSection.jsx';
import IntegracoesWhatsAppSection from '../academy/IntegracoesWhatsAppSection.jsx';

const SECTION_META = Object.fromEntries(INTEGRACOES_SETTINGS_ITEMS.map((item) => [item.id, item]));

export default function IntegracoesSettingsSection() {
  const academyId = useLeadStore((s) => s.academyId);
  const { section, goSection } = useAcademyTabSection(
    'integracoes',
    INTEGRACOES_DEFAULT_SECTION,
    isIntegracoesSettingsSection
  );
  const meta = SECTION_META[section];

  let sectionBody = null;
  if (!academyId) {
    sectionBody = (
      <p className="text-small text-muted">Selecione uma academia para configurar integrações.</p>
    );
  } else if (section === INTEGRACOES_SETTINGS_SECTIONS.WHATSAPP) {
    sectionBody = <IntegracoesWhatsAppSection embeddedInLayout academyId={academyId} />;
  } else if (section === INTEGRACOES_SETTINGS_SECTIONS.CATRACA) {
    sectionBody = <ControlIdCatracaSection embeddedInLayout academyId={academyId} />;
  } else if (section === INTEGRACOES_SETTINGS_SECTIONS.AUTENTIQUE) {
    sectionBody = <ContractsAutentiqueSection embeddedInLayout academyId={academyId} />;
  }

  return (
    <section className="empresa-section animate-in integracoes-settings">
      <AcademyTabSettingsLayout
        navLabel="Integrações"
        items={INTEGRACOES_SETTINGS_ITEMS}
        activeId={section}
        onSelect={goSection}
        title={meta?.panelTitle}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>
    </section>
  );
}
