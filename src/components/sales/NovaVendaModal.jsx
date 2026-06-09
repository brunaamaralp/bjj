import React, { useCallback } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import SalesNewSaleTab from './SalesNewSaleTab.jsx';

export default function NovaVendaModal({ open, onClose }) {
  const handleSaleComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <ModalShell
      open={open}
      title="Nova venda"
      onClose={onClose}
      closeOnOverlay={false}
      maxWidth={960}
      className="nova-venda-modal-backdrop"
      dialogClassName="sales-modal card nova-venda-modal"
      ariaLabelledBy="nova-venda-modal-title"
    >
      <div className="nova-venda-modal__body">
        <SalesNewSaleTab modalMode onSaleComplete={handleSaleComplete} />
      </div>
    </ModalShell>
  );
}
