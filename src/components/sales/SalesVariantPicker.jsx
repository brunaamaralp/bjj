import React from 'react';
import { formatBRL } from '../../lib/moneyBr';
import { catalogLineAvailability, variantCanAddForLineKind, variantOptionLabel } from '../../lib/salesCatalog';
import { normalizeLineKind } from '../../lib/saleLineKind';
import ModalShell from '../shared/ModalShell.jsx';
import ProductThumb from '../products/ProductThumb';

export default function SalesVariantPicker({ parent, lineKind = 'sale', onSelect, onClose }) {
  if (!parent) return null;

  const kind = normalizeLineKind(lineKind);
  const isRental = kind === 'rental';

  const variants = (parent.variants || []).slice().sort((a, b) => {
    const la = variantOptionLabel(a);
    const lb = variantOptionLabel(b);
    return la.localeCompare(lb, 'pt-BR', { numeric: true });
  });

  const unitPrice =
    isRental && parent.rental_price != null ? formatBRL(parent.rental_price) : null;

  return (
    <ModalShell
      open={Boolean(parent)}
      title={parent.nome}
      onClose={onClose}
      closeOnOverlay
      maxWidth={480}
      className="sales-variant-picker-overlay"
      dialogClassName="sales-variant-picker"
      ariaLabelledBy="sales-variant-picker-title"
      footer={
        <button type="button" className="btn-outline sales-variant-picker__cancel" onClick={onClose}>
          Cancelar
        </button>
      }
    >
      <div className="sales-variant-picker__head">
        <ProductThumb imageUrl={parent.image_url} alt={parent.nome} size={48} />
        <p className="text-small text-muted sales-variant-picker__subtitle">
          {isRental ? 'Toque no tamanho para alugar' : 'Toque no tamanho vendido'}
        </p>
      </div>
      <div className="sales-variant-picker__chips" role="list">
        {variants.length === 0 ? (
          <p className="text-small text-muted">Nenhuma variante cadastrada para este produto.</p>
        ) : (
          variants.map((v) => {
            const label = variantOptionLabel(v);
            const avail = catalogLineAvailability(v, parent, kind);
            const out = !variantCanAddForLineKind(v, parent, kind);
            const price =
              isRental && unitPrice
                ? unitPrice
                : v.sale_price != null
                  ? formatBRL(v.sale_price)
                  : null;
            return (
              <button
                key={v.id}
                type="button"
                role="listitem"
                className={`sales-variant-picker__chip${out ? ' sales-variant-picker__chip--out' : ''}`}
                disabled={out}
                onClick={() => !out && onSelect(v)}
              >
                <span className="sales-variant-picker__chip-label">{label}</span>
                <span className="sales-variant-picker__chip-meta text-small text-muted">
                  {out ? 'Esgotado' : `Disp. ${avail}`}
                  {price ? ` · ${price}` : ''}
                </span>
              </button>
            );
          })
        )}
      </div>
    </ModalShell>
  );
}
