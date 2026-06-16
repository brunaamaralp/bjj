import React, { useMemo } from 'react';
import { Link2 } from 'lucide-react';
import { formatReconTxShortTitle } from '../../lib/financeReconTxLabel.js';

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

function parseYmd(s) {
  const raw = String(s || '').trim().slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function daysBetween(aYmd, bYmd) {
  const a = parseYmd(aYmd);
  const b = parseYmd(bYmd);
  if (!a || !b) return 999;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

function txDateYmd(tx) {
  return String(tx.settledAt || tx.settled_at || tx.createdAt || '').slice(0, 10);
}

function amountWithinPercent(a, b, pct = 0.05) {
  const x = Math.abs(Number(a) || 0);
  const y = Math.abs(Number(b) || 0);
  if (x < 0.01) return false;
  return Math.abs(x - y) / x <= pct;
}

function filterOrphansBySelectedItem(orphans, selectedItem, showAll) {
  if (!selectedItem || showAll) return orphans || [];
  return (orphans || []).filter((tx) => isOrphanCandidateForItem(tx, selectedItem));
}

export function isOrphanCandidateForItem(tx, selectedItem) {
  if (!selectedItem || !tx) return false;
  const dayDiff = daysBetween(selectedItem.date, txDateYmd(tx));
  if (dayDiff > 3) return false;
  const gross = Math.abs(Number(tx.gross) || 0);
  return amountWithinPercent(selectedItem.amount, gross);
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

export default function BankReconOrphanList({
  orphans = [],
  selectedItem = null,
  showAll = false,
  onToggleShowAll,
  busy = false,
  onLinkToSelected,
}) {
  const filtered = useMemo(
    () => filterOrphansBySelectedItem(orphans, selectedItem, showAll),
    [orphans, selectedItem, showAll]
  );

  return (
    <div className="bank-recon-orphan-list">
      <div className="bank-recon-orphan-list__head">
        <p className="text-xs text-muted mb-0">
          {selectedItem && !showAll
            ? `Filtrando por valor e data da linha selecionada (${filtered.length})`
            : `${filtered.length} lançamento(s) pendente(s)`}
        </p>
        {selectedItem ? (
          <button type="button" className="btn-text btn-sm" onClick={() => onToggleShowAll?.(!showAll)}>
            {showAll ? 'Filtrar por linha' : 'Mostrar todos'}
          </button>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <p className="text-small text-muted">
          {selectedItem && !showAll
            ? 'Nenhum lançamento próximo. Use "Mostrar todos" ou ajuste a seleção.'
            : 'Nenhum lançamento pendente de conferência.'}
        </p>
      ) : (
        filtered.map((tx) => {
          const isCandidate = selectedItem && isOrphanCandidateForItem(tx, selectedItem);
          return (
          <div
            key={tx.id}
            className={`bank-recon-navi-row bank-recon-navi-row--actionable${isCandidate ? ' bank-recon-navi-row--candidate' : ''}`}
          >
            <div>
              <p className="bank-recon-pair__title">{formatReconTxShortTitle(tx)}</p>
              <p className="text-xs text-muted">
                {fmtDate(tx.settledAt)} · {tx.direction === 'out' ? 'Saída' : 'Entrada'} · {fmtMoney(tx.gross)}
              </p>
            </div>
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
          );
        })
      )}
    </div>
  );
}
