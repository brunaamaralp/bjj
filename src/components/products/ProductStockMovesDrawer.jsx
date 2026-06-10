import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { fetchProductStockMoves } from '../../lib/stockMovesApi.js';
import { stockMoveKindLabel, STOCK_MOVE_TYPE_LABELS } from '../../lib/stockInventory.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { friendlyError } from '../../lib/errorMessages.js';

function formatMoveDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function responsibleLabel(usuarioId) {
  const id = String(usuarioId || '').trim();
  if (!id) return '—';
  if (id.length <= 10) return id;
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export default function ProductStockMovesDrawer({ open, product, onClose }) {
  const academyId = useLeadStore((s) => s.academyId);
  const [moves, setMoves] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !product?.id || !academyId) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    setMoves([]);
    fetchProductStockMoves(product.id, academyId)
      .then((rows) => {
        if (!cancelled) setMoves(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, 'load'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, product?.id, academyId]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !product || typeof document === 'undefined') return null;

  const title = `Movimentações — ${product.nome || product.display_label || 'Produto'}`;

  return createPortal(
    <>
      <div className="navi-side-drawer-backdrop" role="presentation" onClick={onClose} />
      <aside className="navi-side-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="product-moves-drawer-title">
        <div className="navi-side-drawer-header">
          <h2 id="product-moves-drawer-title" className="navi-side-drawer-heading">
            {title}
          </h2>
          <button type="button" className="navi-side-drawer-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="navi-side-drawer-body">
          {loading ? (
            <div className="navi-side-drawer-center">
              <Loader2 size={22} className="product-import-spin" aria-hidden />
              <p className="text-small text-muted">Carregando movimentações…</p>
            </div>
          ) : error ? (
            <p className="text-small" style={{ color: 'var(--danger)' }}>
              {error}
            </p>
          ) : moves.length === 0 ? (
            <p className="text-small text-muted">Nenhuma movimentação registrada para este produto.</p>
          ) : (
            <ul className="product-moves-list">
              {moves.map((m) => {
                const kind = stockMoveKindLabel(m.tipo);
                const detail = STOCK_MOVE_TYPE_LABELS[m.tipo] || m.tipo;
                const qty = Number(m.quantidade) || 0;
                return (
                  <li key={m.id} className="product-moves-list__item">
                    <div className="product-moves-list__row">
                      <span className="product-moves-list__date">{formatMoveDate(m.created_at)}</span>
                      <span className={`product-moves-list__kind product-moves-list__kind--${kind.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}`}>
                        {kind}
                      </span>
                    </div>
                    <div className="product-moves-list__meta text-small text-muted">
                      {detail} · {qty > 0 ? `+${qty}` : qty} un. · {responsibleLabel(m.usuario_id)}
                    </div>
                    {m.motivo ? (
                      <div className="product-moves-list__note text-small">{m.motivo}</div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </>,
    document.body
  );
}
