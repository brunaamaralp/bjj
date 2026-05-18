import React from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { formatBRL, formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';

export default function SalesCart({
  cart,
  lockPriceEdit,
  onQtyChange,
  onPriceChange,
  onRemove,
  subtotalMasked,
  descGeralMasked,
  totalMasked,
}) {
  if (!cart.length) return null;

  return (
    <div className="mt-3">
      <h4 className="navi-section-heading" style={{ marginBottom: 8 }}>Carrinho</h4>
      <div className="sales-cart-list">
        {cart.map((it, idx) => {
          const subtotal = Number(it.quantidade) * Number(it.preco_unitario || 0);
          const priceCents =
            it.preco_unitario != null && it.preco_unitario !== ''
              ? Math.round(Number(it.preco_unitario) * 100)
              : null;
          const priceDisplay =
            priceCents != null && priceCents > 0 ? formatBRLFromCents(priceCents) : '';

          return (
            <div
              className="sales-cart-row card"
              key={`${it.item_estoque_id}-${idx}`}
              style={{ padding: 12, marginBottom: 8 }}
            >
              <div className="flex justify-between items-start gap-2">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{it.display_label}</div>
                  {it.variacao ? <div className="text-small text-muted">{it.variacao}</div> : null}
                </div>
                <button type="button" className="btn-ghost" onClick={() => onRemove(idx)} title="Remover" aria-label="Remover">
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="form-group" style={{ margin: 0, minWidth: 100 }}>
                  <label className="text-xs">Qtd</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onQtyChange(idx, Number(it.quantidade) - 1)}
                      disabled={Number(it.quantidade) <= 1}
                      aria-label="Diminuir"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={it.disponivel > 0 ? it.disponivel : undefined}
                      className="form-input"
                      style={{ width: 56, textAlign: 'center' }}
                      value={it.quantidade}
                      onChange={(e) => onQtyChange(idx, e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onQtyChange(idx, Number(it.quantidade) + 1)}
                      disabled={it.disponivel > 0 && Number(it.quantidade) >= it.disponivel}
                      aria-label="Aumentar"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 120 }}>
                  <label className="text-xs">Preço unit.</label>
                  <input
                    type="text"
                    className="form-input"
                    inputMode="numeric"
                    placeholder="R$ 0,00"
                    value={priceDisplay}
                    disabled={lockPriceEdit}
                    onChange={(e) => onPriceChange(idx, parseMaskToCents(e.target.value))}
                  />
                </div>
                <div className="form-group" style={{ margin: 0, minWidth: 100 }}>
                  <label className="text-xs">Subtotal</label>
                  <div className="form-input" style={{ background: 'var(--surface-2)', fontWeight: 600 }}>
                    {formatBRL(subtotal)}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex sales-cart-totals" style={{ justifyContent: 'flex-end', marginTop: 8, gap: 16, flexWrap: 'wrap' }}>
        <div><strong>Subtotal: </strong>{subtotalMasked}</div>
        <div><strong>Desconto geral: </strong>{descGeralMasked}</div>
        <div><strong>Total: </strong>{totalMasked}</div>
      </div>
    </div>
  );
}


