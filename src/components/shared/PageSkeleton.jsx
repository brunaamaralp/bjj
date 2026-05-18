import React from 'react';

const TABLE_COL_WIDTHS = {
  6: ['28%', '16%', '12%', '18%', '14%', '12%'],
  7: ['24%', '14%', '10%', '12%', '10%', '12%', '18%'],
  9: ['18%', '12%', '8%', '10%', '10%', '8%', '8%', '10%', '16%'],
  10: ['10%', '8%', '14%', '12%', '10%', '10%', '8%', '8%', '10%', '10%'],
};

const ROW_BAR_WIDTHS = [
  ['72%', '48%'],
  ['64%', '40%'],
  ['80%', '52%'],
  ['58%', '44%'],
  ['70%', '50%'],
  ['62%', '46%'],
  ['76%', '42%'],
  ['68%', '54%'],
];

function Shimmer({ className = '', style = {} }) {
  return <span className={`page-skeleton__shimmer ${className}`.trim()} style={style} aria-hidden />;
}

function TableSkeleton({ rows = 6, columns = 6 }) {
  const colWidths = TABLE_COL_WIDTHS[columns] || TABLE_COL_WIDTHS[6];

  return (
    <div className="page-skeleton page-skeleton--table" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando">
      <div className="page-skeleton__table-wrap">
        <div className="page-skeleton__table-head" aria-hidden>
          {colWidths.map((w, i) => (
            <Shimmer key={`h-${i}`} className="page-skeleton__th" style={{ width: w }} />
          ))}
        </div>
        <div className="page-skeleton__table-body">
          {Array.from({ length: rows }, (_, rowIdx) => (
            <div key={rowIdx} className="page-skeleton__table-row">
              {colWidths.map((w, colIdx) => {
                const barW = ROW_BAR_WIDTHS[rowIdx % ROW_BAR_WIDTHS.length][colIdx % 2];
                return (
                  <div key={colIdx} className="page-skeleton__cell" style={{ width: w }}>
                    <Shimmer style={{ width: barW, height: colIdx === 0 ? 14 : 12 }} />
                    {colIdx === 0 ? <Shimmer style={{ width: '42%', height: 10, marginTop: 6 }} /> : null}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CardsSkeleton({ rows = 6 }) {
  const count = Math.min(Math.max(rows, 6), 9);
  return (
    <div className="page-skeleton page-skeleton--cards" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando">
      <div className="page-skeleton__cards-grid">
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="page-skeleton__card">
            <Shimmer className="page-skeleton__card-thumb" />
            <Shimmer style={{ width: i % 2 === 0 ? '78%' : '64%', height: 14, marginTop: 12 }} />
            <Shimmer style={{ width: '40%', height: 12, marginTop: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListSkeleton({ rows = 5 }) {
  const count = Math.min(Math.max(rows, 4), 6);
  return (
    <div className="page-skeleton page-skeleton--list" role="status" aria-live="polite" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="page-skeleton__list-item">
          <Shimmer className="page-skeleton__list-avatar" />
          <div className="page-skeleton__list-body">
            <Shimmer style={{ width: i % 2 === 0 ? '55%' : '48%', height: 14 }} />
            <Shimmer style={{ width: '32%', height: 12, marginTop: 8 }} />
          </div>
          <Shimmer style={{ width: 72, height: 14, flexShrink: 0 }} />
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton de página com shimmer violeta (--v50).
 * @param {'table' | 'cards' | 'list'} variant
 * @param {number} [rows]
 * @param {number} [columns] — apenas variant table (6, 7 ou 10)
 */
export default function PageSkeleton({ variant = 'table', rows, columns = 6 }) {
  if (variant === 'cards') {
    return <CardsSkeleton rows={rows ?? 6} />;
  }
  if (variant === 'list') {
    return <ListSkeleton rows={rows ?? 5} />;
  }
  return <TableSkeleton rows={rows ?? 6} columns={columns} />;
}
