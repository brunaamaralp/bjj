import React from 'react';
import { setPortalActiveStudentId } from '../../lib/portalSession.js';

export default function PortalStudentSwitcher({ students, activeStudentId, onChange }) {
  const list = Array.isArray(students) ? students : [];
  if (list.length <= 1) return null;

  const value = activeStudentId || list[0]?.id || '';

  return (
    <div className="portal-switcher">
      <label className="sr-only" htmlFor="portal-student-switcher">
        Selecionar aluno
      </label>
      <select
        id="portal-student-switcher"
        value={value}
        onChange={(e) => {
          const id = e.target.value;
          setPortalActiveStudentId(id);
          onChange?.(id);
        }}
      >
        {list.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name || 'Aluno'}
          </option>
        ))}
      </select>
    </div>
  );
}
