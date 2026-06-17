import React, { useMemo, useState } from 'react';
import { Eye, Link2, Search } from 'lucide-react';
import { formatReconTxShortTitle } from '../../lib/financeReconTxLabel.js';
import { filterBankReconOrphans, isOrphanCandidateForItem } from '../../lib/bankReconOrphanFilter.js';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(ymd) {
  const p = String(ymd || '').slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

const FORMAT_LABELS = {
  ofx: 'OFX',
  csv: 'CSV',
  xlsx: 'Excel',
  pdf: 'PDF',
};

export function formatSourceLabel(format) {
  const key = String(format || '').toLowerCase();
  return FORMAT_LABELS[key] || (key ? key.toUpperCase() : '—');
}

export { isOrphanCandidateForItem };

const DIRECTION_FILTERS = [
  { id: 'all', label: 'Todos' },
  { id: 'in', label: 'Entradas' },
  { id: 'out', label: 'Saídas' },
];

export default function BankReconOrphanList({
  orphans = [],
  selectedItem = null,
  showAll = false,
  onToggleShowAll,
  busy = false,
  onLinkToSelected,
  onViewDetails,
}) {
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState('all');

  const filtered = useMemo(
    () =>
      filterBankReconOrphans(orphans, {
        selectedItem,
        showAll,
        query,
        direction,
      }),
    [orphans, selectedItem, showAll, query, direction]
  );

  const totalCount = orphans.length;
  const hasActiveFilters = Boolean(query.trim()) || direction !== 'all';

  return (
    <div className="bank-recon-orphan-list">
      <div className="bank-recon-orphan-list__head">
        <p className="text-xs text-muted mb-0">
          {selectedItem && !showAll
            ? `Compatíveis com a linha selecionada (${filtered.length} de ${totalCount})`
            : `${filtered.length} de ${totalCount} lançamento(s) pendente(s)`}
        </p>
        {selectedItem ? (
          <button type="button" className="btn-text btn-sm" onClick={() => onToggleShowAll?.(!showAll)}>
            {showAll ? 'Filtrar por linha' : 'Mostrar todos'}
          </button>
        ) : null}
      </div>

      <div className="bank-recon-orphan-list__filters">
        <label className="bank-recon-orphan-list__search" htmlFor="bank-recon-orphan-search">
          <Search size={14} aria-hidden className="bank-recon-orphan-list__search-icon" />
          <input
            id="bank-recon-orphan-search"
            type="search"
            className="form-input form-input--compact bank-recon-orphan-list__search-input"
            placeholder="Buscar por aluno, valor, categoria…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <div className="bank-recon-orphan-list__direction" role="group" aria-label="Filtrar por natureza">
          {DIRECTION_FILTERS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`btn-outline btn-sm bank-recon-orphan-list__direction-btn${
                direction === opt.id ? ' bank-recon-orphan-list__direction-btn--active' : ''
              }`}
              aria-pressed={direction === opt.id}
              onClick={() => setDirection(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {!selectedItem ? (
        <p className="text-xs text-muted bank-recon-orphan-list__hint">
          Selecione uma linha do extrato para ver sugestões por valor e data, ou use a busca acima.
        </p>
      ) : null}

      {filtered.length === 0 ? (
        <p className="text-small text-muted">
          {selectedItem && !showAll && !hasActiveFilters
            ? 'Nenhum lançamento próximo. Use "Mostrar todos" ou refine a busca.'
            : hasActiveFilters
              ? 'Nenhum lançamento corresponde aos filtros.'
              : 'Nenhum lançamento pendente de conferência.'}
        </p>
      ) : (
        <div className="bank-recon-orphan-list__scroll">
          {filtered.map((tx) => {
            const isCandidate = selectedItem && isOrphanCandidateForItem(tx, selectedItem);
            return (
              <div
                key={tx.id}
                className={`bank-recon-navi-row bank-recon-navi-row--actionable${
                  isCandidate ? ' bank-recon-navi-row--candidate' : ''
                }`}
              >
                <button
                  type="button"
                  className="bank-recon-navi-row__main"
                  aria-label={`Ver detalhes: ${formatReconTxShortTitle(tx)}`}
                  onClick={() => onViewDetails?.(tx)}
                >
                  <p className="bank-recon-pair__title">{formatReconTxShortTitle(tx)}</p>
                  <p className="text-xs text-muted">
                    {fmtDate(tx.settledAt)} · {tx.direction === 'out' ? 'Saída' : 'Entrada'} ·{' '}
                    {fmtMoney(tx.gross)}
                  </p>
                </button>
                <div className="bank-recon-navi-row__actions">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={busy}
                    title="Ver detalhes"
                    onClick={() => onViewDetails?.(tx)}
                  >
                    <Eye size={14} /> Detalhes
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={busy || !selectedItem}
                    title={selectedItem ? 'Vincular à linha selecionada' : 'Selecione uma linha do extrato'}
                    onClick={() => void onLinkToSelected?.(tx.id)}
                  >
                    <Link2 size={14} /> Vincular
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
