import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, Loader2, Pencil } from 'lucide-react';
import SearchField from '../shared/SearchField.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import StockEntryCorrectionWizard from './StockEntryCorrectionWizard.jsx';import { useInventoryStore } from '../../store/useInventoryStore';
import { stockEntryCorrectionError } from '../../lib/stockEntryCorrection.js';
import { useToast } from '../../hooks/useToast.js';
import { refreshStockStores } from '../../lib/syncStockStores';
function formatMoveDate(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '—';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`;
  }
}

function CashLinkBadge({ move }) {
  const txId = String(move.financial_tx_id || '').trim();
  if (!txId) {
    if (move.tipo === 'entrada' && move.purchase_price > 0) {
      return <span className="inventory-move-badge inventory-move-badge--muted">Caixa pendente</span>;
    }
    return <span className="inventory-move-badge inventory-move-badge--muted">Só estoque</span>;
  }

  const st = String(move.financial_tx_status || '').toLowerCase();
  if (st === 'cancelled') {
    return <span className="inventory-move-badge inventory-move-badge--warn">Estornada no Caixa</span>;
  }

  return (
    <Link
      to={`/financeiro?tab=movimentacoes&tx=${encodeURIComponent(txId)}`}
      className="inventory-move-badge inventory-move-badge--cash"
    >
      No Caixa · {formatMoney(move.purchase_price)}
      <ExternalLink size={12} aria-hidden />
    </Link>
  );
}

export default function InventoryMovesHistory({
  highlightMoveId = '',
  modulesFinance = false,
  canCorrectEntry = false,
  onMovesLoaded,
}) {
  const listMoves = useInventoryStore((s) => s.listMoves);
  const correctEntry = useInventoryStore((s) => s.correctEntry);
  const moves = useInventoryStore((s) => s.moves);
  const movesCursor = useInventoryStore((s) => s.movesCursor);
  const movesLoading = useInventoryStore((s) => s.movesLoading);
  const movesError = useInventoryStore((s) => s.movesError);
  const [itemFilter, setItemFilter] = useState('');
  const [correctionMove, setCorrectionMove] = useState(null);
  const highlightRef = useRef(null);
  const toast = useToast();

  const inconsistentMoves = useMemo(
    () => moves.filter((m) => m.has_inconsistency && m.inconsistency_message),
    [moves]
  );

  const load = useCallback(
    async (opts = {}) => {
      await listMoves({
        item_estoque_id: itemFilter.trim() || undefined,
        cursor: opts.cursor || '',
        append: Boolean(opts.append),
      });
    },
    [itemFilter, listMoves]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (typeof onMovesLoaded === 'function') onMovesLoaded(moves);
  }, [moves, onMovesLoaded]);

  useEffect(() => {
    if (!highlightMoveId || !highlightRef.current) return;
    highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [highlightMoveId, moves]);

  const submitCorrection = async (payload) => {
    try {
      const result = await correctEntry(payload);
      const steps = result?.steps_completed || [];
      if (steps.includes('finance') && steps.includes('quantity')) {
        toast.success('Entrada corrigida. Estoque e Caixa atualizados.');
      } else if (steps.includes('finance')) {
        toast.success('Despesa no Caixa corrigida.');
      } else if (steps.includes('quantity')) {
        toast.success(
          result?.wac_reverted
            ? 'Quantidade ajustada e custo médio restaurado. A despesa no Caixa não foi alterada.'
            : 'Quantidade ajustada. A despesa no Caixa não foi alterada.'
        );
      } else {
        toast.success('Correção registrada.');
      }
      setCorrectionMove(null);
      await refreshStockStores();
      await load();
    } catch (e) {
      toast.show({
        type: 'error',
        message: stockEntryCorrectionError(e?.message, e?.partial),
      });
    }
  };

  return (
    <div className="inventory-moves-history card animate-in">
      <div className="inventory-moves-history__toolbar">
        <h3 className="navi-section-heading">Histórico</h3>
        <div className="inventory-moves-history__filters">
          <SearchField
            value={itemFilter}
            onChange={setItemFilter}
            placeholder="Filtrar por ID do item…"
            ariaLabel="Filtrar movimentações por item"
            className="inventory-moves-history__search"
          />
          <button type="button" className="btn-outline btn-sm" onClick={() => void load()} disabled={movesLoading}>
            Atualizar
          </button>
        </div>
      </div>

      {movesError ? (
        <p className="text-small text-danger mb-2" role="alert">
          {movesError}
        </p>
      ) : null}

      {modulesFinance && inconsistentMoves.length > 0 ? (
        <StatusBanner variant="warning" className="inventory-moves-history__inconsistency mb-2">
          {inconsistentMoves.length === 1
            ? inconsistentMoves[0].inconsistency_message
            : `${inconsistentMoves.length} entradas com divergência entre estoque e Caixa. Revise as linhas destacadas.`}
        </StatusBanner>
      ) : null}

      {movesLoading && moves.length === 0 ? (
        <PageSkeleton variant="table" rows={5} />
      ) : moves.length === 0 ? (
        <EmptyState
          variant="compact"
          tone="dashed"
          title="Nenhuma movimentação registrada"
          description="Entradas, ajustes e saídas aparecerão aqui."
        />
      ) : (
        <div className="inventory-moves-history__table-wrap">
          <table className="inventory-table inventory-moves-history__table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Item</th>
                <th>Tipo</th>
                <th className="inventory-num">Qtd</th>
                {modulesFinance ? <th>Caixa</th> : null}
                <th className="inventory-moves-history__actions-col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {moves.map((move) => {
                const highlighted = highlightMoveId && move.id === highlightMoveId;
                const qty = Number(move.quantidade);
                const qtyLabel = Number.isFinite(qty) ? (qty > 0 ? `+${qty}` : String(qty)) : '—';
                return (
                  <tr
                    key={move.id}
                    ref={highlighted ? highlightRef : undefined}
                    className={
                      highlighted
                        ? 'inventory-moves-history__row--highlight'
                        : move.has_inconsistency
                          ? 'inventory-moves-history__row--inconsistent'
                          : undefined
                    }
                  >
                    <td className="text-small text-muted">{formatMoveDate(move.created_at)}</td>
                    <td>
                      <span className="inventory-moves-history__item-label">{move.item_label || '—'}</span>
                    </td>
                    <td>{move.tipo_label || move.tipo}</td>
                    <td className="inventory-num">{qtyLabel}</td>
                    {modulesFinance ? (
                      <td>
                        <CashLinkBadge move={move} />
                      </td>
                    ) : null}
                    <td className="inventory-moves-history__actions-col">
                      {move.tipo === 'entrada' ? (
                        <button
                          type="button"
                          className="btn-outline btn-sm"
                          title={
                            canCorrectEntry
                              ? 'Corrigir entrada'
                              : 'Apenas titular ou administrador pode corrigir'
                          }
                          disabled={!canCorrectEntry || movesLoading}
                          onClick={() => setCorrectionMove(move)}
                        >
                          <Pencil size={13} aria-hidden />
                          Corrigir
                        </button>
                      ) : (
                        <span className="text-muted text-small">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {movesCursor ? (
        <div className="inventory-moves-history__more">
          <button
            type="button"
            className="btn-outline btn-sm"
            disabled={movesLoading}
            onClick={() => void load({ cursor: movesCursor, append: true })}
          >
            {movesLoading ? (
              <>
                <Loader2 size={14} className="spin" aria-hidden />
                Carregando…
              </>
            ) : (
              'Carregar mais'
            )}
          </button>
        </div>
      ) : null}

      <StockEntryCorrectionWizard
        open={Boolean(correctionMove)}
        move={correctionMove}
        modulesFinance={modulesFinance}
        canCorrect={canCorrectEntry}
        loading={movesLoading}
        onClose={() => setCorrectionMove(null)}
        onSubmit={submitCorrection}
      />
    </div>
  );
}
