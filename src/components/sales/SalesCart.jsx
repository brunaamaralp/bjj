import React, { useState } from 'react';
import { Minus, Plus, Trash2, ShoppingBag } from 'lucide-react';
import { formatBRL, formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';
import ProductThumb from '../products/ProductThumb';
import { variantOptionLabel } from '../../lib/salesCatalog';
import { normalizeLineKind } from '../../lib/saleLineKind';

function lineKindLabel(lineKind) {
  return normalizeLineKind(lineKind) === 'rental' ? 'Aluguel' : 'Venda';
}

export default function SalesCart({
  cart,
  lockPriceEdit,
  onQtyChange,
  onPriceChange,
  onVariantChange,
  onRemove,
  subtotalMasked,
  descGeralMasked,
  totalMasked,
  inlineValidate = false,
  priceTouched = {},
  onPriceBlur,
}) {
  const [removingIdx, setRemovingIdx] = useState(null);

  const handleRemove = (idx) => {
    if (removingIdx != null) return;
    setRemovingIdx(idx);
    window.setTimeout(() => {
      onRemove(idx);
      setRemovingIdx(null);
    }, 280);
  };

  return (
    <section className="sales-cart sales-cart--with-sticky-footer" aria-label="Carrinho">
      <h4 className="sales-cart__heading">Carrinho</h4>

      {cart.length === 0 ? (
        <div className="sales-cart-empty" role="status">
          <ShoppingBag size={28} strokeWidth={1.5} aria-hidden />
          <p>Adicione produtos ao carrinho</p>
        </div>
      ) : (
        <ul className="sales-cart-list">
          {cart.map((it, idx) => {
            const subtotal = Number(it.quantidade) * Number(it.preco_unitario || 0);
            const priceCents =
              it.preco_unitario != null && it.preco_unitario !== ''
                ? Math.round(Number(it.preco_unitario) * 100)
                : null;
            const priceDisplay =
              priceCents != null && priceCents > 0 ? formatBRLFromCents(priceCents) : '';
            const isRemoving = removingIdx === idx;

            return (
              <li
                key={`${it.item_estoque_id}-${it.line_kind || 'sale'}-${idx}`}
                className={`sales-cart-row${isRemoving ? ' sales-cart-row--removing' : ''}`}
              >
                <div className="sales-cart-row__head">
                  <ProductThumb imageUrl={it.image_url} alt={it.display_label} size={40} />
                  <div className="sales-cart-row__info">
                    <span className="sales-cart-row__name">{it.display_label}</span>
                    <span
                      className={`sales-cart-row__kind sales-cart-row__kind--${normalizeLineKind(it.line_kind)}`}
                      aria-label={`Tipo: ${lineKindLabel(it.line_kind)}`}
                    >
                      {lineKindLabel(it.line_kind)}
                    </span>
                    {Array.isArray(it.variant_options) && it.variant_options.length > 1 ? (
                      <div className="sales-cart-row__variant">
                        <label className="text-xs" htmlFor={`sale-variant-${idx}`}>
                          Tamanho
                        </label>
                        <select
                          id={`sale-variant-${idx}`}
                          className="form-input sales-cart-row__variant-select"
                          value={it.item_estoque_id}
                          onChange={(e) => onVariantChange?.(idx, e.target.value)}
                        >
                          {it.variant_options.map((v) => {
                            const label = variantOptionLabel(v);
                            const canAdd = v.canAdd_for_line ?? v.canAdd;
                            const avail = v.disponivel_for_line ?? v.current_quantity;
                            const out =
                              !canAdd &&
                              String(v.id) !== String(it.item_estoque_id) &&
                              avail <= 0;
                            return (
                              <option key={v.id} value={v.id} disabled={out}>
                                {label}
                                {out ? ' (esgotado)' : ''}
                                {avail > 0 ? ` · disp. ${avail}` : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    ) : it.variacao ? (
                      <span className="sales-cart-row__var">{it.variacao}</span>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="btn-ghost sales-cart-row__remove"
                    onClick={() => handleRemove(idx)}
                    title="Remover"
                    aria-label="Remover item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="sales-cart-row__controls">
                  <div className="sales-cart-qty">
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onQtyChange(idx, Number(it.quantidade) - 1)}
                      disabled={Number(it.quantidade) <= 1}
                      aria-label="Diminuir quantidade"
                    >
                      <Minus size={14} />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={it.disponivel > 0 ? it.disponivel : undefined}
                      className="form-input sales-cart-qty__input"
                      value={it.quantidade}
                      onChange={(e) => onQtyChange(idx, e.target.value)}
                      aria-label="Quantidade"
                    />
                    <button
                      type="button"
                      className="btn-outline btn-sm"
                      onClick={() => onQtyChange(idx, Number(it.quantidade) + 1)}
                      disabled={it.disponivel > 0 && Number(it.quantidade) >= it.disponivel}
                      aria-label="Aumentar quantidade"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="sales-cart-row__price">
                    <label className="text-xs">
                      Unit.
                      {!lockPriceEdit && inlineValidate ? (
                        <span className="sales-field-required"> *</span>
                      ) : null}
                    </label>
                    <input
                      type="text"
                      className={`form-input${
                        inlineValidate && !lockPriceEdit && priceTouched[idx] && (!priceCents || priceCents <= 0)
                          ? ' sales-input--invalid'
                          : ''
                      }`}
                      inputMode="numeric"
                      placeholder="R$ 0,00"
                      value={priceDisplay}
                      disabled={lockPriceEdit}
                      onBlur={() => onPriceBlur?.(idx)}
                      onChange={(e) => onPriceChange(idx, parseMaskToCents(e.target.value))}
                    />
                    {inlineValidate && !lockPriceEdit && priceTouched[idx] && (!priceCents || priceCents <= 0) ? (
                      <p className="sales-field-error" role="alert">Campo obrigatório</p>
                    ) : null}
                  </div>
                  <div className="sales-cart-row__subtotal">
                    <span className="text-xs">Subtotal</span>
                    <strong>{formatBRL(subtotal)}</strong>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <footer className="sales-cart-footer">
        <div className="sales-cart-footer__row">
          <span>Subtotal</span>
          <span>{subtotalMasked}</span>
        </div>
        <div className="sales-cart-footer__row sales-cart-footer__row--muted">
          <span>Desconto geral</span>
          <span>{descGeralMasked}</span>
        </div>
        <div className="sales-cart-footer__row sales-cart-footer__total">
          <span>Total</span>
          <strong>{totalMasked}</strong>
        </div>
      </footer>
    </section>
  );
}
