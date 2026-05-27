import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Package, CreditCard } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import { prefetchFinanceConfig } from '../../lib/prefetchFinanceConfig.js';
import { useLeadStore } from '../../store/useLeadStore';
import SalesNewSaleTab from './SalesNewSaleTab.jsx';
import NovaVendaPlanPanel from './NovaVendaPlanPanel.jsx';

const SALE_TYPES = [
  {
    id: 'product',
    label: 'Venda de produto',
    description: 'Kimono, acessório, etc.',
    Icon: Package,
  },
  {
    id: 'plan',
    label: 'Venda de plano',
    description: 'Mensalidade',
    Icon: CreditCard,
  },
];

export default function NovaVendaModal({ open, onClose }) {
  const academyId = useLeadStore((s) => s.academyId);
  const [saleType, setSaleType] = useState(null);

  const requestClose = useCallback(() => {
    setSaleType(null);
    onClose();
  }, [onClose]);

  useModalA11y({ isOpen: open, onClose: requestClose });

  useEffect(() => {
    if (!open) {
      setSaleType(null);
      return;
    }
    if (academyId) void prefetchFinanceConfig(academyId);
  }, [open, academyId]);

  const handleSaleComplete = useCallback(() => {
    setSaleType(null);
    onClose();
  }, [onClose]);

  if (!open || typeof document === 'undefined') return null;

  const title =
    saleType === 'product'
      ? 'Nova venda — produto'
      : saleType === 'plan'
        ? 'Nova venda — plano'
        : 'Nova venda';

  return createPortal(
    <div
      className="nova-venda-modal-backdrop"
      role="presentation"
      onClick={requestClose}
    >
      <div
        className="sales-modal card nova-venda-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="nova-venda-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="nova-venda-modal__head">
          <h2 id="nova-venda-modal-title" className="nova-venda-modal__title">
            {title}
          </h2>
          <button
            type="button"
            className="nova-venda-modal__close"
            onClick={requestClose}
            aria-label="Fechar"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </button>
        </header>

        <div className="nova-venda-modal__body">
          {!saleType ? (
            <div className="nova-venda-type-picker" role="list">
              {SALE_TYPES.map(({ id, label, description, Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="listitem"
                  className="nova-venda-type-picker__option"
                  onClick={() => setSaleType(id)}
                >
                  <span className="nova-venda-type-picker__icon" aria-hidden>
                    <Icon size={22} strokeWidth={1.75} />
                  </span>
                  <span className="nova-venda-type-picker__text">
                    <span className="nova-venda-type-picker__label">{label}</span>
                    <span className="nova-venda-type-picker__desc">{description}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : saleType === 'product' ? (
            <>
              <button
                type="button"
                className="btn-ghost nova-venda-modal__back"
                onClick={() => setSaleType(null)}
              >
                ← Voltar
              </button>
              <SalesNewSaleTab modalMode onSaleComplete={handleSaleComplete} />
            </>
          ) : (
            <NovaVendaPlanPanel onComplete={handleSaleComplete} onBack={() => setSaleType(null)} />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
