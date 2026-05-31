import React, { useMemo } from 'react';
import { ChevronRight, CheckCircle2, Circle } from 'lucide-react';
import {
  STUDENT_SETTINGS_ITEMS,
  buildStudentSettingsSummaries,
} from '../../../lib/studentSettingsSections.js';
import '../../finance/finance.css';

function SettingsRow({ item, summary, onSelect }) {
  const meta = summary[item.id] || { summary: '', done: false };
  return (
    <button type="button" className="finance-settings-row" onClick={() => onSelect(item.id)}>
      <span className="finance-settings-row__main">
        <span className="finance-settings-row__label">{item.label}</span>
        <span className="finance-settings-row__value">{meta.summary}</span>
      </span>
      <span className="finance-settings-row__aside">
        {meta.done ? (
          <CheckCircle2 size={16} className="finance-settings-row__check" aria-hidden />
        ) : (
          <Circle size={16} className="finance-settings-row__pending" aria-hidden />
        )}
        <ChevronRight size={18} className="finance-settings-row__chevron" aria-hidden />
      </span>
    </button>
  );
}

export default function StudentsSettingsHub({ academy, turmasCount, onSelectSection }) {
  const summaries = useMemo(
    () => buildStudentSettingsSummaries({ academy, turmasCount }),
    [academy, turmasCount]
  );

  return (
    <div className="finance-settings-hub animate-in">
      <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.45 }}>
        Cadastro, matrícula e opções exibidas ao desligar ou pausar alunos.
      </p>
      <div className="finance-settings-group">
        <p className="finance-settings-group__label">Alunos</p>
        <div className="finance-settings-group__list card">
          {STUDENT_SETTINGS_ITEMS.map((item, idx) => (
            <React.Fragment key={item.id}>
              {idx > 0 ? <div className="finance-settings-group__sep" aria-hidden /> : null}
              <SettingsRow item={item} summary={summaries} onSelect={onSelectSection} />
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
