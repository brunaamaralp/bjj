import React from 'react';

const TITLE_TAGS = new Set(['h2', 'h3', 'p', 'div']);

/**
 * Estado vazio padronizado (Fase A — design system Nave).
 *
 * @param {'default' | 'compact' | 'embedded' | 'table-cell' | 'bare' | 'column'} variant
 * @param {'solid' | 'dashed'} tone
 */
export default function EmptyState({
  variant = 'default',
  tone = 'solid',
  className = '',
  insideCard = false,
  title,
  description,
  icon: Icon,
  primaryAction,
  secondaryAction,
  role = 'status',
  ariaLive = 'polite',
  titleId,
  titleAs = 'p',
  titleClassName = '',
}) {
  const titleTagName = TITLE_TAGS.has(String(titleAs || '').toLowerCase()) ? String(titleAs).toLowerCase() : 'p';
  const dashed = tone === 'dashed' || variant === 'column';
  const rootClass = [
    'navi-empty',
    variant === 'default' && 'navi-empty--default',
    variant === 'compact' && 'navi-empty--compact',
    variant === 'embedded' && 'navi-empty--embedded',
    variant === 'table-cell' && 'navi-empty--table-cell',
    variant === 'bare' && 'navi-empty--bare',
    variant === 'column' && 'navi-empty--column',
    dashed && 'navi-empty--dashed',
    !dashed && variant !== 'bare' && variant !== 'table-cell' && 'navi-empty--solid',
    insideCard && 'navi-empty--in-card',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const titleIsString = typeof title === 'string';
  const titleClass =
    variant === 'bare' || variant === 'table-cell'
      ? `navi-empty__title navi-empty__title--muted${titleClassName ? ` ${titleClassName}` : ''}`
      : `navi-empty__title${titleClassName ? ` ${titleClassName}` : ''}`;

  const a11y =
    role === 'none'
      ? {}
      : {
          role,
          'aria-live': ariaLive,
          ...(titleId ? { 'aria-labelledby': titleId } : {}),
        };

  const body = (
    <>
      {Icon ? (
        <Icon className="navi-empty__icon" size={variant === 'table-cell' ? 32 : 44} strokeWidth={1.5} aria-hidden />
      ) : null}
      {titleIsString ? (
        React.createElement(titleTagName, { id: titleId || undefined, className: titleClass }, title)
      ) : (
        <div id={titleId || undefined} className={titleClass}>
          {title}
        </div>
      )}
      {description ? (
        typeof description === 'string' ? (
          <p className="navi-empty__desc text-small">{description}</p>
        ) : (
          <div className="navi-empty__desc text-small">{description}</div>
        )
      ) : null}
      {(primaryAction || secondaryAction) && (
        <div className="navi-empty__actions">
          {primaryAction ? (
            primaryAction.href ? (
              <a
                className="btn-primary"
                href={primaryAction.href}
                style={{ textDecoration: 'none', display: 'inline-flex' }}
              >
                {primaryAction.label}
              </a>
            ) : (
              <button type="button" className="btn-primary" onClick={primaryAction.onClick}>
                {primaryAction.label}
              </button>
            )
          ) : null}
          {secondaryAction ? (
            secondaryAction.variant === 'link' || secondaryAction.link ? (
              <button type="button" className="navi-empty__link-btn" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </button>
            ) : (
              <button type="button" className="btn-outline" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </button>
            )
          ) : null}
        </div>
      )}
    </>
  );

  return (
    <div className={rootClass} {...a11y}>
      {variant === 'table-cell' ? <div className="navi-empty__inner">{body}</div> : body}
    </div>
  );
}
