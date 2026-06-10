import React, { useMemo } from 'react';
import { getPipelineStageColor } from '../../lib/pipelineStageColors.js';
import './stage-badge.css';

/**
 * Badge de etapa do funil (dot + pill).
 *
 * @param {object} props
 * @param {string} props.stage — id ou nome da etapa (lookup em getPipelineStageColor)
 * @param {string} [props.label] — rótulo exibido (default: stage)
 * @param {'sm' | 'md'} [props.size]
 * @param {boolean} [props.showDot]
 * @param {boolean} [props.showLabel]
 * @param {number} [props.colorIndex] — índice fallback para etapas dinâmicas
 * @param {string} [props.className]
 */
export default function StageBadge({
  stage,
  label,
  size = 'sm',
  showDot = true,
  showLabel = true,
  colorIndex = 0,
  className = '',
}) {
  const stageKey = String(stage || '').trim();

  const colors = useMemo(() => {
    if (!stageKey) return getPipelineStageColor('', 0);
    const resolved = getPipelineStageColor(stageKey, colorIndex);
    return resolved?.color ? resolved : getPipelineStageColor(stageKey, 0);
  }, [stageKey, colorIndex]);

  if (!stageKey) return null;

  const displayLabel = String(label ?? stageKey).trim();
  const title = displayLabel ? `Etapa: ${displayLabel}` : undefined;

  return (
    <span
      className={[
        'stage-badge',
        `stage-badge--${size}`,
        showLabel ? '' : 'stage-badge--dot-only',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--stage-badge-color': colors.color }}
      title={title}
    >
      {showDot ? <span className="stage-badge__dot" aria-hidden /> : null}
      {showLabel ? <span className="stage-badge__label">{displayLabel}</span> : null}
    </span>
  );
}
