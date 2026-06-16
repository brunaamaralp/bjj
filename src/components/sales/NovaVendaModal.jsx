import '../../styles/sales.css';
import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ModalShell from '../shared/ModalShell.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import SalesNewSaleTab from './SalesNewSaleTab.jsx';
import { useSalesStore } from '../../store/useSalesStore';

export const NOVA_VENDA_FORM_ID = 'nova-venda-form';

export default function NovaVendaModal({ open, onClose }) {
  const navigate = useNavigate();
  const creating = useSalesStore((s) => s.creating);
  const [variantPickerOpen, setVariantPickerOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [submitState, setSubmitState] = useState({
    canSubmit: false,
    busy: false,
    label: 'Concluir venda',
    footerHint: null,
    footerError: null,
  });

  const handleSaleComplete = useCallback(() => {
    onClose();
  }, [onClose]);

  const requestClose = useCallback(() => {
    if (creating || submitState.busy) return;
    if (isDirty) {
      setShowDiscardDialog(true);
      return;
    }
    onClose();
  }, [creating, submitState.busy, isDirty, onClose]);

  const handleNavigateAway = useCallback(
    (path) => {
      onClose();
      navigate(path);
    },
    [onClose, navigate]
  );

  return (
    <>
      <ModalShell
        open={open}
        title="Vender produto"
        onClose={requestClose}
        closeOnOverlay={false}
        closeOnEsc={!variantPickerOpen && !creating}
        maxWidth={960}
        className="navi-modal-overlay--form"
        dialogClassName="sales-modal card nova-venda-modal"
        ariaLabelledBy="nova-venda-modal-title"
        footer={
          <div className="sales-modal-footer">
            {submitState.footerError || submitState.footerHint ? (
              <p
                className={`sales-modal-footer__hint${submitState.footerError ? ' sales-modal-footer__hint--error' : ''}`}
                role={submitState.footerError ? 'alert' : 'status'}
              >
                {submitState.footerError || submitState.footerHint}
              </p>
            ) : null}
            <div className="nova-venda-modal__footer">
              <button type="button" className="btn-outline" onClick={requestClose} disabled={creating}>
                Cancelar
              </button>
              <button
                type="submit"
                form={NOVA_VENDA_FORM_ID}
                className="btn-primary"
                disabled={creating || !submitState.canSubmit}
              >
                {submitState.label}
              </button>
            </div>
          </div>
        }
      >
        <div className="nova-venda-modal__body">
          <SalesNewSaleTab
            modalMode
            formId={NOVA_VENDA_FORM_ID}
            hideSubmitButton
            onSaleComplete={handleSaleComplete}
            onVariantPickerChange={setVariantPickerOpen}
            onDirtyChange={setIsDirty}
            onSubmitStateChange={setSubmitState}
            onNavigateAway={handleNavigateAway}
          />
        </div>
      </ModalShell>

      <ConfirmDialog
        open={showDiscardDialog}
        title="Descartar venda?"
        description="Os itens do carrinho e as informações preenchidas serão perdidos."
        confirmLabel="Descartar"
        confirmVariant="danger"
        onConfirm={() => {
          setShowDiscardDialog(false);
          onClose();
        }}
        onClose={() => setShowDiscardDialog(false)}
      />
    </>
  );
}
