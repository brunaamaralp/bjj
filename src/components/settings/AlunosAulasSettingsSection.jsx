import React from 'react';
import AcademyTabSettingsLayout from '../academy/settings/AcademyTabSettingsLayout.jsx';
import StudentsSection from '../academy/StudentsSection.jsx';
import HorariosSection from '../academy/HorariosSection.jsx';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import {
  ALUNOS_AULAS_DEFAULT_SECTION,
  ALUNOS_AULAS_SETTINGS_ITEMS,
  isAlunosAulasSettingsSection,
} from '../../lib/alunosAulasSettingsSections.js';
import { STUDENT_SETTINGS_SECTIONS } from '../../lib/studentSettingsSections.js';
import { HORARIOS_SETTINGS_SECTIONS } from '../../lib/horariosSettingsSections.js';

const SECTION_META = Object.fromEntries(ALUNOS_AULAS_SETTINGS_ITEMS.map((item) => [item.id, item]));

function isHorarioSection(section) {
  return (
    section === HORARIOS_SETTINGS_SECTIONS.TURMAS ||
    section === HORARIOS_SETTINGS_SECTIONS.HORARIOS
  );
}

export default function AlunosAulasSettingsSection({
  academy,
  setAcademy,
  academyId,
  academyDataVersion = 0,
  role,
}) {
  const { section, goSection } = useAcademyTabSection(
    'alunos-aulas',
    ALUNOS_AULAS_DEFAULT_SECTION,
    isAlunosAulasSettingsSection
  );

  const canAccessHorarios = role === 'owner';
  const items = ALUNOS_AULAS_SETTINGS_ITEMS.map((item) => {
    const disabled = isHorarioSection(item.id) && !canAccessHorarios;
    return disabled
      ? {
          ...item,
          disabled: true,
          disabledTitle: 'Disponível apenas para o titular da academia',
        }
      : item;
  });

  const activeSection =
    !canAccessHorarios && isHorarioSection(section) ? STUDENT_SETTINGS_SECTIONS.CAMPOS : section;
  const meta = SECTION_META[activeSection];

  let sectionBody = null;
  if (isHorarioSection(activeSection)) {
    sectionBody = (
      <HorariosSection
        academyId={academyId}
        embeddedInLayout
        forcedSection={activeSection}
      />
    );
  } else {
    sectionBody = (
      <StudentsSection
        academy={academy}
        setAcademy={setAcademy}
        academyId={academyId}
        academyDataVersion={academyDataVersion}
        embeddedInLayout
        forcedSection={activeSection}
      />
    );
  }

  return (
    <section className="empresa-section animate-in alunos-aulas-settings">
      <AcademyTabSettingsLayout
        navLabel="Seções de alunos e aulas"
        items={items}
        activeId={activeSection}
        onSelect={goSection}
        title={meta?.label}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>
    </section>
  );
}
