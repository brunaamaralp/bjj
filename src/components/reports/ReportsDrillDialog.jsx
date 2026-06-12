import React from 'react';
import { Link } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { DRILL_PANEL_ACCENT } from '../../lib/reportsFunnelUtils.js';
import './reports.css';

export default function ReportsDrillDialog({ drillKey, title, list, range, onClose }) {
  return (
    <ModalShell
      open={Boolean(drillKey)}
      title={title}
      onClose={onClose}
      maxWidth={448}
      dialogClassName={`reports-drill-modal reports-drill-modal--${DRILL_PANEL_ACCENT[drillKey] || 'accent'}`}
      ariaLabelledBy="reports-drill-title"
    >
      <p className="text-xs text-muted reports-drill-meta-line">
        {list.length} {list.length === 1 ? 'pessoa' : 'pessoas'} · período {range.from} — {range.to}
      </p>
      {list.length === 0 ? (
        <EmptyState
          variant="compact"
          tone="dashed"
          title="Nenhum dado no período selecionado"
          description="Tente ajustar o intervalo de datas."
          role="status"
        />
      ) : (
        <ul className="reports-drill-list">
          {list.map((l) => (
            <li key={l.id}>
              <Link to={`/lead/${l.id}`} className="reports-drill-link" onClick={onClose}>
                <span className="reports-drill-name">{l.name || 'Sem nome'}</span>
                <span className="reports-drill-meta">{[l.type, l.phone].filter(Boolean).join(' · ')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}
