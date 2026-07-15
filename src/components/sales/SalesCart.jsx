import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import NumberFlow from '@number-flow/react';
import { Minus, Plus, ShoppingCart, X } from 'lucide-react';
import { formatBRLFromCents, parseMaskToCents } from '../../lib/moneyBr';
import ProductThumb from '../products/ProductThumb';
import { variantOptionLabel } from '../../lib/salesCatalog';
import { normalizeLineKind } from '../../lib/saleLineKind';

const BRL_FLOW = { style: 'currency', currency: 'BRL' };
const MotionUl = motion.ul;
const MotionLi = motion.li;
const MotionButton = motion.button;
const MotionFooter = motion.footer;

function lineKindLabel(lineKind) {
  return normalizeLineKind(lineKind) === 'rental' ? 'Aluguel' : 'Venda';
}

function rowKey(it, idx) {
  return `${it.item_estoque_id}-${it.line_kind || 'sale'}-${idx}`;
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
  subtotalValue,
  totalValue,
  inlineValidate = false,
  priceTouched = {},
  onPriceBlur,
}) {
  const totalItems = useMemo(
    () => cart.reduce((sum, it) => sum + Math.max(0, Number(it.quantidade) || 0), 0),
    [cart]
  );

  const resolvedSubtotal =
    subtotalValue != null && Number.isFinite(Number(subtotalValue))
      ? Number(subtotalValue)
      : null;
  const resolvedTotal =
    totalValue != null && Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;

  return (
    <section className="sales-cart sales-cart--interactive sales-cart--with-sticky-footer" aria-label="Carrinho">
      <header className="sales-cart__heading-row">
        <ShoppingCart className="sales-cart__heading-icon" size={16} aria-hidden />
        <h4 className="sales-cart__heading">
          Carrinho
          <span className="sales-cart__count" aria-label={`${totalItems} itens`}>
            ({totalItems})
          </span>
        </h4>
      </header>

      {cart.length === 0 ? (
        <div className="sales-cart-empty" role="status">
          <ShoppingCart size={28} strokeWidth={1.5} aria-hidden />
          <p>Adicione produtos ao carrinho</p>
        </div>
      ) : (
        <MotionUl className="sales-cart-list" layout>
          <AnimatePresence initial={false} mode="popLayout">
            {cart.map((it, idx) => {
              const subtotal = Number(it.quantidade) * Number(it.preco_unitario || 0);
              const priceCents =
                it.preco_unitario != null && it.preco_unitario !== ''
                  ? Math.round(Number(it.preco_unitario) * 100)
                  : null;
              const priceDisplay =
                priceCents != null && priceCents > 0 ? formatBRLFromCents(priceCents) : '';

              return (
                <MotionLi
                  key={rowKey(it, idx)}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{
                    opacity: { duration: 0.2 },
                    layout: { duration: 0.2 },
                  }}
                  className="sales-cart-row"
                >
                  <div className="sales-cart-row__head">
                    <ProductThumb imageUrl={it.image_url} alt={it.display_label} size={40} />
                    <div className="sales-cart-row__info">
                      <div className="sales-cart-row__title-line">
                        <span className="sales-cart-row__name">{it.display_label}</span>
                        <MotionButton
                          type="button"
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.95 }}
                          className="btn-ghost sales-cart-row__remove"
                          onClick={() => onRemove(idx)}
                          title="Remover"
                          aria-label="Remover item"
                        >
                          <X size={14} />
                        </MotionButton>
                      </div>
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
                  </div>

                  <div className="sales-cart-row__controls">
                    <div className="sales-cart-qty">
                      <MotionButton
                        type="button"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        className="sales-cart-qty__btn"
                        onClick={() => onQtyChange(idx, Number(it.quantidade) - 1)}
                        disabled={Number(it.quantidade) <= 1}
                        aria-label="Diminuir quantidade"
                      >
                        <Minus size={14} />
                      </MotionButton>
                      <input
                        type="number"
                        min={1}
                        max={it.disponivel > 0 ? it.disponivel : undefined}
                        className="form-input sales-cart-qty__input"
                        value={it.quantidade}
                        onChange={(e) => onQtyChange(idx, e.target.value)}
                        aria-label="Quantidade"
                      />
                      <MotionButton
                        type="button"
                        whileHover={{ scale: 1.08 }}
                        whileTap={{ scale: 0.95 }}
                        className="sales-cart-qty__btn"
                        onClick={() => onQtyChange(idx, Number(it.quantidade) + 1)}
                        disabled={it.disponivel > 0 && Number(it.quantidade) >= it.disponivel}
                        aria-label="Aumentar quantidade"
                      >
                        <Plus size={14} />
                      </MotionButton>
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
                          inlineValidate &&
                          !lockPriceEdit &&
                          priceTouched[idx] &&
                          (!priceCents || priceCents <= 0)
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
                      {inlineValidate &&
                      !lockPriceEdit &&
                      priceTouched[idx] &&
                      (!priceCents || priceCents <= 0) ? (
                        <p className="sales-field-error" role="alert">
                          Campo obrigatório
                        </p>
                      ) : null}
                    </div>

                    <div className="sales-cart-row__subtotal">
                      <span className="text-xs">Subtotal</span>
                      <strong>
                        <NumberFlow value={subtotal} format={BRL_FLOW} locales="pt-BR" />
                      </strong>
                    </div>
                  </div>
                </MotionLi>
              );
            })}
          </AnimatePresence>
        </MotionUl>
      )}

      <MotionFooter layout className="sales-cart-footer">
        <div className="sales-cart-footer__row">
          <span>Subtotal</span>
          <span>
            {resolvedSubtotal != null ? (
              <NumberFlow value={resolvedSubtotal} format={BRL_FLOW} locales="pt-BR" />
            ) : (
              subtotalMasked
            )}
          </span>
        </div>
        <div className="sales-cart-footer__row sales-cart-footer__row--muted">
          <span>Desconto geral</span>
          <span>{descGeralMasked}</span>
        </div>
        <div className="sales-cart-footer__row sales-cart-footer__total">
          <span>Total</span>
          <strong>
            {resolvedTotal != null ? (
              <NumberFlow value={resolvedTotal} format={BRL_FLOW} locales="pt-BR" />
            ) : (
              totalMasked
            )}
          </strong>
        </div>
      </MotionFooter>
    </section>
  );
}
