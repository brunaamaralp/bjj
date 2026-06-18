import React from 'react';
import '../../styles/setting-row.css';

/**
 * Linha de configuração: título + hint à esquerda, controle (ex.: toggle) à direita.
 */
export default function SettingRow({
  label,
  hint,
  control,
  children,
  className = '',
  flush = false,
  labelId,
}) {
  return (
    <div
      className={`navi-setting-row${flush ? ' navi-setting-row--flush' : ''}${className ? ` ${className}` : ''}`}
    >
      <div className="navi-setting-row__text">
        {label ? (
          <span id={labelId} className="navi-setting-row__label">
            {label}
          </span>
        ) : null}
        {hint ? <span className="navi-setting-row__hint">{hint}</span> : null}
        {children}
      </div>
      {control ? <div className="navi-setting-row__control">{control}</div> : null}
    </div>
  );
}
