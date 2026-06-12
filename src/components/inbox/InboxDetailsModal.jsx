import React, { Suspense, lazy } from 'react';

const InboxContextPanelContent = lazy(() =>
  import('./InboxContextPanel').then((m) => ({ default: m.InboxContextPanelContent }))
);

export default function InboxDetailsModal({
  open,
  modalRef,
  onClose,
  contextPanelProps,
}) {
  if (!open) return null;

  return (
    <div
      className="inbox-details-modal-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={modalRef}
        className="inbox-details-modal-shell inbox-details-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inbox-details-modal-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="inbox-details-modal__header">
          <h2 id="inbox-details-modal-title" className="inbox-details-modal__title">
            Detalhes
          </h2>
          <button className="btn btn-outline navi-btn--toolbar" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <div className="inbox-details-modal-scroll">
          <Suspense fallback={null}>
            <InboxContextPanelContent {...contextPanelProps} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
