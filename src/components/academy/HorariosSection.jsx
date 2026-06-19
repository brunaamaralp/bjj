import React from 'react';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import {
  HORARIOS_SETTINGS_ITEMS,
  HORARIOS_DEFAULT_SECTION,
  isHorariosSettingsSection,
  HORARIOS_SETTINGS_SECTIONS,
} from '../../lib/horariosSettingsSections.js';
import AcademyTabSettingsLayout from './settings/AcademyTabSettingsLayout.jsx';
import ClassesSection from './ClassesSection.jsx';
import SchedulesSection from './SchedulesSection.jsx';

export default function HorariosSection({ academyId }) {
  const { section, goSection } = useAcademyTabSection(
    'horarios',
    HORARIOS_DEFAULT_SECTION,
    isHorariosSettingsSection
  );

  const meta = HORARIOS_SETTINGS_ITEMS.find((item) => item.id === section);

  let sectionBody = null;

  if (section === HORARIOS_SETTINGS_SECTIONS.TURMAS) {
    sectionBody = (
      <div className="finance-settings-section-body">
        <ClassesSection academyId={academyId} embeddedInLayout />
      </div>
    );
  } else if (section === HORARIOS_SETTINGS_SECTIONS.HORARIOS) {
    sectionBody = (
      <div className="finance-settings-section-body">
        <SchedulesSection academyId={academyId} embeddedInLayout />
      </div>
    );
  }

  return (
    <section className="empresa-section horarios-section animate-in">
      <AcademyTabSettingsLayout
        navLabel="Seções de horários"
        items={HORARIOS_SETTINGS_ITEMS}
        activeId={section}
        onSelect={goSection}
        title={meta?.label}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>
    </section>
  );
}
