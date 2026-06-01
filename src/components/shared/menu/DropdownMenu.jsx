import React from 'react';
import { useDismissibleMenu } from '../../../hooks/useDismissibleMenu';
import './menu.css';

function cn(...parts) {
  return parts.filter(Boolean).join(' ');
}

export function DropdownMenu({
  open,
  onOpenChange,
  children,
  className = '',
  align = 'end',
  elevated = false,
  dismissExtraSelector,
}) {
  const rootRef = useDismissibleMenu(open, onOpenChange, { dismissExtraSelector });
  return (
    <div
      ref={rootRef}
      className={cn('navi-menu', elevated && 'navi-menu--elevated', className)}
      data-align={align}
    >
      {children}
    </div>
  );
}

export function DropdownMenuPanel({
  children,
  className = '',
  role = 'menu',
  fixed = false,
  style,
  elevated = false,
  onClick,
  'aria-label': ariaLabel,
  ...rest
}) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={cn(
        'navi-menu__panel',
        fixed && 'navi-menu__panel--fixed',
        elevated && 'navi-menu--elevated',
        className,
      )}
      style={style}
      onClick={onClick}
      onMouseDown={(e) => e.stopPropagation()}
      {...rest}
    >
      {children}
    </div>
  );
}

export function DropdownMenuItem({
  children,
  className = '',
  danger = false,
  active = false,
  disabled = false,
  icon,
  onClick,
  onMouseDown,
  role = 'menuitem',
  title,
  ...props
}) {
  return (
    <button
      type="button"
      role={role}
      disabled={disabled}
      title={title}
      className={cn(
        'navi-menu__item',
        danger && 'navi-menu__item--danger',
        active && 'navi-menu__item--active',
        disabled && 'navi-menu__item--disabled',
        className,
      )}
      onClick={onClick}
      onMouseDown={onMouseDown}
      {...props}
    >
      {icon ? <span className="navi-menu__item-icon">{icon}</span> : null}
      {children}
    </button>
  );
}

/** Item não interativo (ex.: “Sem templates”). */
export function DropdownMenuItemStatic({ children, className = '', disabled = false }) {
  return (
    <div
      className={cn(
        'navi-menu__item',
        'navi-menu__item--static',
        disabled && 'navi-menu__item--disabled',
        className,
      )}
      role="presentation"
    >
      {children}
    </div>
  );
}

export function DropdownMenuLabel({ children, className = '' }) {
  return (
    <div className={cn('navi-menu__label', className)} role="presentation">
      {children}
    </div>
  );
}

export function DropdownMenuHeader({ children, className = '' }) {
  return (
    <div className={cn('navi-menu__header', className)} role="none">
      {children}
    </div>
  );
}

export function DropdownMenuDivider({ className = '' }) {
  return <hr className={cn('navi-menu__divider', className)} aria-hidden />;
}

export function DropdownMenuBackdrop({ onClick, className = '' }) {
  return <div className={cn('navi-menu__backdrop', className)} role="presentation" onClick={onClick} />;
}
