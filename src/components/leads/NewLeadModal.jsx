import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Save } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import NewLeadForm from './NewLeadForm.jsx';
import { useLeadStore } from '../../store/useLeadStore';

const FORM_ID = 'new-lead-modal-form';

function singularLeadLabel(plural) {
  if (!plural) return 'Lead';
  const p = String(plural).trim();
  if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
  return p;
}

export default function NewLeadModal({ open, onClose }) {
  const navigate = useNavigate();
  const leadLabelSingular = useMemo(
    () => singularLeadLabel(useLeadStore.getState().labels?.leads || 'Leads'),
    [open]
  );
  const [footerState, setFooterState] = useState({
    submitting: false,
    canSubmit: true,
    submitLabel: 'Salvar',
  });

  const handleSuccess = useCallback(
    (created) => {
      onClose?.();
      if (created?.id) {
        navigate(`/lead/${encodeURIComponent(created.id)}`);
      }
    },
    [navigate, onClose]
  );

  const handleViewExisting = useCallback(
    (duplicate) => {
      onClose?.();
      navigate(
        duplicate._duplicateKind === 'student'
          ? `/student/${encodeURIComponent(duplicate.id)}`
          : `/lead/${encodeURIComponent(duplicate.id)}`
      );
    },
    [navigate, onClose]
  );

  if (!open) return null;

  return (
    <ModalShell
      open={open}
      title={`Novo ${leadLabelSingular}`}
      onClose={onClose}
      closeOnOverlay={false}
      maxWidth={560}
      className="new-lead-modal-backdrop navi-modal-overlay--form"
      dialogClassName="new-lead-modal navi-modal-shell--scroll-body"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={footerState.submitting}>
            Cancelar
          </button>
          <button
            type="submit"
            form={FORM_ID}
            className="btn-primary"
            disabled={!footerState.canSubmit || footerState.submitting}
          >
            {footerState.submitting ? (
              'Salvando…'
            ) : (
              <>
                <Save size={18} aria-hidden />
                {footerState.submitLabel}
              </>
            )}
          </button>
        </>
      }
    >
      <p className="navi-subtitle navi-subtitle--spaced">Cadastre um contato para o funil.</p>
      <NewLeadForm
        variant="modal"
        formId={FORM_ID}
        onSuccess={handleSuccess}
        onViewExisting={handleViewExisting}
        onFooterStateChange={setFooterState}
      />
    </ModalShell>
  );
}
