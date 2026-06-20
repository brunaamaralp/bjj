import React from 'react';
import {
  FUNIL_SETTINGS_ITEMS,
  FUNIL_SETTINGS_SECTIONS,
  FUNIL_DEFAULT_SECTION,
  isFunilSettingsSection,
} from '../../lib/funilSettingsSections.js';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import AcademyTabSettingsLayout from './settings/AcademyTabSettingsLayout.jsx';
import PipelineStagesSection from './PipelineStagesSection.jsx';
import FunilQuestionsSection from './FunilQuestionsSection.jsx';
import UiLabelsSection from './UiLabelsSection.jsx';
import ReportsKpiGoalsSection from './ReportsKpiGoalsSection.jsx';
import { useUserRole } from '../../lib/useUserRole';
import '../finance/finance.css';

const SECTION_META = Object.fromEntries(FUNIL_SETTINGS_ITEMS.map((item) => [item.id, item]));

const FunilSection = ({ academy, setAcademy, academyId, academyDataVersion = 0, onSave, tabId = 'funil' }) => {
  const role = useUserRole(academy);
  const canEdit = role === 'owner';
  const { section, goSection } = useAcademyTabSection(
    tabId,
    FUNIL_DEFAULT_SECTION,
    isFunilSettingsSection
  );
  const meta = SECTION_META[section];

  let sectionBody = null;
  if (section === FUNIL_SETTINGS_SECTIONS.ETAPAS) {
    sectionBody = (
      <PipelineStagesSection
        academyId={academyId}
        vertical={academy.vertical}
        academyDataVersion={academyDataVersion}
        academyForRole={academy}
      />
    );
  } else if (section === FUNIL_SETTINGS_SECTIONS.PERGUNTAS) {
    sectionBody = (
      <FunilQuestionsSection
        academy={academy}
        setAcademy={setAcademy}
        academyId={academyId}
        academyDataVersion={academyDataVersion}
      />
    );
  } else if (section === FUNIL_SETTINGS_SECTIONS.ETIQUETAS) {
    sectionBody = (
      <UiLabelsSection academy={academy} setAcademy={setAcademy} onSave={onSave} canEdit={canEdit} />
    );
  } else if (section === FUNIL_SETTINGS_SECTIONS.METAS) {
    sectionBody = <ReportsKpiGoalsSection academyId={academyId} canEdit={canEdit} />;
  }

  return (
    <section className="empresa-section animate-in funil-settings-section">
      <AcademyTabSettingsLayout
        navLabel="Seções do funil"
        items={FUNIL_SETTINGS_ITEMS}
        activeId={section}
        onSelect={goSection}
        title={meta?.label}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>
    </section>
  );
};

export default FunilSection;
