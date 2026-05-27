import React, { useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { mapLeadToPaymentContact, isLeadEnrolledStudent } from '../../lib/leadCloseSale.js';
import NovaVendaPlanPanel from './NovaVendaPlanPanel.jsx';

export default function LeadCloseSaleModal({
  open,
  lead,
  onClose,
  academyId,
  userId,
  permissionContext = {},
}) {
  const prefilled = useMemo(() => mapLeadToPaymentContact(lead), [lead]);
  const showNotStudentHint = useMemo(() => lead && !isLeadEnrolledStudent(lead), [lead]);

  const requestClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useModalA11y({ isOpen: open && Boolean(lead), onClose: requestClose });

  const handleComplete = useCallback(async () => {
    if (lead?.id && academyId) {
      await addLeadEvent({
        academyId,
        leadId: lead.id,
        type: 'venda',
        text: 'Venda registrada antes da matrícula',
        createdBy: userId || 'user',
        permissionContext,
      });
    }
    onClose?.();
  }, [lead?.id, academyId, userId, permissionContext, onClose]);

  if (!open || !lead || typeof document === 'undefined') return null;

  return createPortal(
    <div className="sales-modal-backdrop" role="presentation" onClick={requestClose}>
      <div
        className="sales-modal card sales-modal--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lead-close-sale-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 id="lead-close-sale-title" className="navi-section-heading" style={{ margin: 0 }}>
            Fechar venda
          </h3>
          <button type="button" className="btn-ghost" onClick={requestClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <NovaVendaPlanPanel
          prefilledStudent={prefilled}
          showNotStudentHint={showNotStudentHint}
          onComplete={() => void handleComplete()}
          onBack={requestClose}
        />
      </div>
    </div>,
    document.body
  );
}
