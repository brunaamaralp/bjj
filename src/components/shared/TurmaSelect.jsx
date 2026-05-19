import React from 'react';
import { TURMA_OUTRO_VALUE } from '../../lib/academyTurmas.js';

export default function TurmaSelect({
  turmas,
  selectValue,
  otherText,
  onSelectChange,
  onOtherChange,
  id,
  otherId,
  className = 'form-input',
  style,
  disabled = false,
  emptyLabel = 'Selecione…',
}) {
  const list = Array.isArray(turmas) && turmas.length > 0 ? turmas : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <select
        id={id}
        className={className}
        style={style}
        disabled={disabled}
        value={selectValue || ''}
        onChange={(e) => onSelectChange(e.target.value)}
      >
        <option value="">{emptyLabel}</option>
        {list.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value={TURMA_OUTRO_VALUE}>Outro</option>
      </select>
      {selectValue === TURMA_OUTRO_VALUE ? (
        <input
          id={otherId}
          type="text"
          className={className}
          style={style}
          disabled={disabled}
          value={otherText || ''}
          onChange={(e) => onOtherChange(e.target.value)}
          placeholder="Informe a turma"
          maxLength={64}
        />
      ) : null}
    </div>
  );
}
