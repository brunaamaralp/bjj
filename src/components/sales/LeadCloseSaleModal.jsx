import React, { useCallback, useMemo } from 'react';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { mapLeadToPaymentContact, isLeadEnrolledStudent } from '../../lib/leadCloseSale.js';
import ModalShell from '../shared/ModalShell.jsx';
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
  }, [lead, academyId, userId, permissionContext, onClose]);

  if (!lead) return null;

  return (
    <ModalShell
      open={open && Boolean(lead)}
      title="Fechar venda"
      onClose={onClose}
      closeOnOverlay={false}
      maxWidth={560}
      className="sales-modal-backdrop navi-modal-overlay--form"
      dialogClassName="sales-modal card sales-modal--wide"
      ariaLabelledBy="lead-close-sale-title"
    >
      <NovaVendaPlanPanel
        prefilledStudent={prefilled}
        showNotStudentHint={showNotStudentHint}
        onComplete={() => void handleComplete()}
        onBack={onClose}
      />
    </ModalShell>
  );
}
