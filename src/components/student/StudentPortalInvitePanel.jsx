import React, { useCallback, useEffect, useState } from 'react';
import { Link2, KeyRound, UserX } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  fetchPortalInviteStatus,
  sendPortalInvite,
  revokePortalInvite,
  linkPortalSibling,
} from '../../lib/portalApi';
import StatusBanner from '../shared/StatusBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const STATUS_LABELS = {
  none: 'Sem convite',
  pending: 'Convite pendente',
  active: 'Portal ativo',
  revoked: 'Acesso revogado',
};

function isMinorStudent(student) {
  const type = String(student?.type || 'Adulto');
  return type === 'Criança' || type === 'Juniores';
}

export default function StudentPortalInvitePanel({ student, academyId, canEdit }) {
  const addToast = useUiStore((s) => s.addToast);
  const [status, setStatus] = useState('none');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [siblingBanner, setSiblingBanner] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!student?.id || !academyId) return;
    setLoading(true);
    try {
      const data = await fetchPortalInviteStatus(student.id, academyId);
      setStatus(String(data.access_status || 'none'));
      setSiblingBanner(false);
    } catch {
      setStatus('none');
    } finally {
      setLoading(false);
    }
  }, [student?.id, academyId]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const handleInvite = async (inviteType) => {
    if (!student?.id || !academyId || busy) return;
    setBusy(true);
    try {
      const data = await sendPortalInvite({ studentId: student.id, academyId, inviteType });
      if (data.linked_sibling) {
        addToast({ type: 'success', message: 'Vinculado ao portal do responsável.' });
        setSiblingBanner(false);
      } else if (data.activation_url) {
        try {
          await navigator.clipboard.writeText(data.activation_url);
          addToast({ type: 'success', message: 'Link de ativação copiado.' });
        } catch {
          addToast({ type: 'success', message: 'Convite criado. Copie o link no painel.' });
        }
      } else if (data.temp_password) {
        try {
          await navigator.clipboard.writeText(data.temp_password);
          addToast({ type: 'success', message: 'Senha temporária copiada.' });
        } catch {
          addToast({ type: 'info', message: `Senha temporária: ${data.temp_password}` });
        }
      } else {
        addToast({ type: 'success', message: 'Convite enviado.' });
      }
      setStatus(String(data.access_status || 'pending'));
    } catch (e) {
      const code = String(e?.code || '');
      if (code === 'guardian_email_required') {
        addToast({ type: 'error', message: 'Informe o e-mail do responsável no cadastro.' });
      } else if (code === 'student_email_required') {
        addToast({ type: 'error', message: 'Informe o e-mail do aluno no cadastro.' });
      } else if (code === 'staff_email_conflict') {
        addToast({ type: 'error', message: 'Este e-mail pertence a um usuário da equipe.' });
      } else {
        addToast({ type: 'error', message: friendlyError(e, 'action') });
      }
      if (code === 'guardian_email_required' && isMinorStudent(student)) {
        setSiblingBanner(true);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLinkSibling = async () => {
    if (!student?.id || !academyId || busy) return;
    setBusy(true);
    try {
      await linkPortalSibling(student.id, academyId);
      addToast({ type: 'success', message: 'Aluno vinculado ao portal do responsável.' });
      setSiblingBanner(false);
      await loadStatus();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!student?.id || !academyId || busy) return;
    setBusy(true);
    try {
      await revokePortalInvite(student.id, academyId);
      addToast({ type: 'success', message: 'Acesso ao portal revogado.' });
      setStatus('revoked');
      setRevokeOpen(false);
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setBusy(false);
    }
  };

  if (!student?.id) return null;

  const badgeClass =
    status === 'active'
      ? 'badge-success'
      : status === 'pending'
        ? 'badge-secondary'
        : 'badge-secondary';

  return (
    <div className="profile-section-block">
      <div className="profile-section-heading-row">
        <h3 className="profile-section-heading">Portal do aluno</h3>
        {!loading ? (
          <span className={badgeClass}>{STATUS_LABELS[status] || status}</span>
        ) : null}
      </div>

      {isMinorStudent(student) && !String(student.emailResponsavel || '').trim() ? (
        <StatusBanner variant="warning" className="mb-3">
          Para convidar um menor, preencha o <strong>e-mail do responsável</strong> nos dados do aluno.
        </StatusBanner>
      ) : null}

      {siblingBanner ? (
        <StatusBanner variant="info" className="mb-3">
          Já existe acesso de responsável com este e-mail.{' '}
          {canEdit ? (
            <button type="button" className="profile-edit-btn" disabled={busy} onClick={() => void handleLinkSibling()}>
              Vincular automaticamente
            </button>
          ) : null}
        </StatusBanner>
      ) : null}

      {canEdit ? (
        <div className="flex gap-2 flex-wrap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary btn-sm" disabled={busy} onClick={() => void handleInvite('link')}>
            <Link2 size={16} aria-hidden />
            Convidar com link
          </button>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={busy}
            onClick={() => void handleInvite('temp_password')}
          >
            <KeyRound size={16} aria-hidden />
            Senha temporária
          </button>
          {status === 'active' || status === 'pending' ? (
            <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => setRevokeOpen(true)}>
              <UserX size={16} aria-hidden />
              Revogar
            </button>
          ) : null}
        </div>
      ) : (
        <p className="info-mini-label">Somente a equipe pode enviar convites.</p>
      )}

      <ConfirmDialog
        open={revokeOpen}
        title="Revogar acesso ao portal?"
        description="O aluno ou responsável não poderá mais entrar no portal até um novo convite."
        confirmLabel="Revogar"
        variant="danger"
        busy={busy}
        onConfirm={() => void handleRevoke()}
        onCancel={() => setRevokeOpen(false)}
      />
    </div>
  );
}
