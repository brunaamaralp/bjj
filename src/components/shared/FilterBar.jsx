import React from 'react';

export default function FilterBar({
  className = '',
  compact = false,
  dense = false,
  stackedMobile = false,
  children,
  ...props
}) {
  const classes = [
    'filter-bar',
    compact ? 'filter-bar--compact' : '',
    dense ? 'filter-bar--dense' : '',
    stackedMobile ? 'filter-bar--stacked-mobile' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
