import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Plus, Pencil, KeyRound, Users, X, Copy } from 'lucide-react';
import { teams } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import {
  membershipPrimaryLabel,
  membershipSecondaryEmail,
  membershipRoleDisplayLabel,
  membershipRolePillStyle,
  membershipStatusLabel,
  membershipStatusPillStyle,
  membershipJoinedDate,
} from '../../lib/teamMembershipLabel.js';
import {
  resolveActorRoleFromMemberships,
  membershipTeamRole,
  canEditTeamMember,
  canRemoveTeamMember,
  canResetTeamPassword,
  canAddTeamMember,
  canViewTeamManagement,
  canEditField,
} from '../../lib/teamPermissions.js';
import {
  createTeamMember,
  updateTeamMember,
  removeTeamMember,
  resetTeamMemberPassword,
  fetchTeamAuditEvents,
  fetchTeamMemberships,
} from '../../lib/teamApi.js';

const ROLE_OPTIONS = [
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'admin', label: 'Administrador' },
];

function EquipeSection({ academy, academyId }) {
  const addToast = useUiStore((s) => s.addToast);
  const userId = useLeadStore((s) => s.userId);
  const hasTeam = Boolean(academy?.teamId);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersLoadError, setMembersLoadError] = useState(false);

  const [newMember, setNewMember] = useState({ name: '', email: '', role: 'receptionist' });
  const [savingMember, setSavingMember] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [tempPasswordModal, setTempPasswordModal] = useState(null);

  const [editMember, setEditMember] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', role: 'receptionist' });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editEmailWarning, setEditEmailWarning] = useState('');

  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeBusy, setRemoveBusy] = useState(false);

  const [resetTarget, setResetTarget] = useState(null);
  const [resetBusy, setResetBusy] = useState(false);

  const [auditEvents, setAuditEvents] = useState([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditLoading, setAuditLoading] = useState(false);
  const AUDIT_PAGE = 10;

  const actorRole = useMemo(
    () => resolveActorRoleFromMemberships(members, academy, userId),
    [members, academy, userId]
  );
  const isOwner = actorRole === 'owner';
  const canManage = canViewTeamManagement(actorRole);

  const loadMembers = useCallback(async () => {
    if (!academy?.teamId) return;
    setMembersLoadError(false);
    setLoadingMembers(true);
    try {
      if (academyId) {
        const data = await fetchTeamMemberships(academyId);
        setMembers(data.memberships || []);
      } else {
        const result = await teams.listMemberships(academy.teamId);
        setMembers(result.memberships || []);
      }
    } catch (e) {
      console.error('loadMembers error:', e);
      setMembersLoadError(true);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [academy?.teamId, academyId]);

  useEffect(() => {
    if (!academy?.teamId) {
      setMembers([]);
      setMembersLoadError(false);
      return;
    }
    void loadMembers();
  }, [academy?.teamId, loadMembers]);

  const loadAudit = useCallback(
    async (offset = 0, append = false) => {
      if (!isOwner || !academyId) return;
      setAuditLoading(true);
      try {
        const data = await fetchTeamAuditEvents(academyId, { limit: AUDIT_PAGE, offset });
        const rows = data.events || [];
        setAuditEvents((prev) => (append ? [...prev, ...rows] : rows));
        setAuditTotal(data.total || 0);
        setAuditOffset(offset + rows.length);
      } catch (e) {
        console.warn('[equipe] audit:', e);
        if (!append) setAuditEvents([]);
      } finally {
        setAuditLoading(false);
      }
    },
    [isOwner, academyId]
  );

  useEffect(() => {
    if (isOwner && academyId) void loadAudit(0, false);
  }, [isOwner, academyId, loadAudit]);

  const handleCreateMember = async (e) => {
    e.preventDefault();
    setMemberError('');
    if (!hasTeam) {
      setMemberError('Equipe ainda não configurada. Salve os dados da academia primeiro.');
      return;
    }
    if (!newMember.name.trim() || !newMember.email.trim()) {
      setMemberError('Preencha nome e e-mail.');
      return;
    }
    if (!canAddTeamMember(actorRole, newMember.role)) {
      setMemberError('Sem permissão para adicionar este papel.');
      return;
    }

    setSavingMember(true);
    try {
      const data = await createTeamMember({
        name: newMember.name.trim(),
        email: newMember.email.trim(),
        role: newMember.role,
        teamId: academy.teamId,
        academyId: String(academyId || '').trim(),
      });

      await loadMembers();
      setNewMember({ name: '', email: '', role: 'receptionist' });

      if (data.inviteSent) {
        addToast({ type: 'success', message: `Convite enviado para ${data.memberEmail || newMember.email}` });
      } else if (data.tempPassword) {
        setTempPasswordModal({
          email: data.memberEmail,
          password: data.tempPassword,
          name: data.displayName,
        });
      } else {
        addToast({ type: 'success', message: `${data.roleLabel || 'Membro'} adicionado.` });
      }
      if (isOwner) void loadAudit(0, false);
    } catch (error) {
      const status = error?.status;
      let msg = error?.message || 'Não foi possível adicionar o membro.';
      if (status === 401) msg = 'Sessão expirada, faça login novamente.';
      if (status === 403) msg = 'Você não tem permissão para adicionar membros.';
      if (status === 409) msg = 'Já existe uma conta com este e-mail.';
      setMemberError(msg);
    } finally {
      setSavingMember(false);
    }
  };

  const openEditMember = (m) => {
    const targetRole = membershipTeamRole(m, academy?.ownerId);
    if (!canEditTeamMember(actorRole, targetRole, userId, m.userId)) return;
    setEditError('');
    setEditEmailWarning('');
    setEditForm({
      name: membershipPrimaryLabel(m) === 'Usuário' ? '' : membershipPrimaryLabel(m),
      email: String(m.userEmail || m.email || '').trim(),
      role: targetRole === 'admin' ? 'admin' : 'receptionist',
    });
    setEditMember(m);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setEditError('');
    setEditEmailWarning('');
    if (!editMember) return;

    const targetRole = membershipTeamRole(editMember, academy?.ownerId);
    const trimmedName = editForm.name.trim();
    const trimmedEmail = editForm.email.trim().toLowerCase();

    if (!trimmedName) {
      setEditError('Informe o nome.');
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        academyId: String(academyId || '').trim(),
        teamId: academy.teamId,
        membershipId: editMember.$id,
        userId: editMember.userId,
        name: trimmedName,
      };
      const prevEmail = String(editMember.userEmail || editMember.email || '').trim().toLowerCase();
      if (
        trimmedEmail &&
        trimmedEmail !== prevEmail &&
        canEditField(actorRole, targetRole, 'email', userId, editMember.userId)
      ) {
        payload.email = trimmedEmail;
      }
      if (
        editForm.role &&
        targetRole !== 'owner' &&
        canEditField(actorRole, targetRole, 'role', userId, editMember.userId)
      ) {
        payload.role = editForm.role;
      }

      const data = await updateTeamMember(payload);
      await loadMembers();
      if (data.emailReconfirm) {
        setEditEmailWarning('O membro receberá um e-mail para confirmar o novo endereço.');
      } else {
        setEditMember(null);
        addToast({ type: 'success', message: `Dados de ${trimmedName} atualizados` });
      }
      if (isOwner) void loadAudit(0, false);
    } catch (error) {
      const status = error?.status;
      let msg = error?.message || 'Não foi possível salvar.';
      if (status === 403) msg = 'Sem permissão para editar este membro.';
      setEditError(msg);
    } finally {
      setEditSaving(false);
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoveBusy(true);
    try {
      await removeTeamMember({
        academyId: String(academyId || '').trim(),
        teamId: academy.teamId,
        membershipId: removeTarget.$id,
      });
      setMembers((prev) => prev.filter((m) => m.$id !== removeTarget.$id));
      addToast({ type: 'success', message: 'Membro removido da equipe.' });
      if (isOwner) void loadAudit(0, false);
    } catch (error) {
      addToast({
        type: 'error',
        message: error?.message || 'Não foi possível remover o membro.',
      });
    } finally {
      setRemoveBusy(false);
      setRemoveTarget(null);
    }
  };

  const confirmResetPassword = async () => {
    if (!resetTarget) return;
    setResetBusy(true);
    try {
      const data = await resetTeamMemberPassword({
        academyId: String(academyId || '').trim(),
        teamId: academy.teamId,
        membershipId: resetTarget.$id,
      });
      addToast({
        type: 'success',
        message: `E-mail de redefinição enviado para ${data.email || resetTarget.userEmail || 'o membro'}`,
      });
      if (isOwner) void loadAudit(0, false);
    } catch (error) {
      addToast({
        type: 'error',
        message: error?.message || 'Não foi possível enviar o e-mail de redefinição.',
      });
    } finally {
      setResetBusy(false);
      setResetTarget(null);
    }
  };

  const renderRowActions = (m) => {
    const targetRole = membershipTeamRole(m, academy?.ownerId);
    const show =
      canEditTeamMember(actorRole, targetRole, userId, m.userId) ||
      canRemoveTeamMember(actorRole, targetRole, userId, m.userId) ||
      canResetTeamPassword(actorRole, targetRole, userId, m.userId);
    if (!show) return null;

    return (
      <div className="equipe-table__actions-inner">
        {canEditTeamMember(actorRole, targetRole, userId, m.userId) ? (
          <button
            type="button"
            className="equipe-icon-btn"
            title="Editar"
            aria-label="Editar"
            onClick={() => openEditMember(m)}
          >
            <Pencil size={16} aria-hidden />
          </button>
        ) : null}
        {canResetTeamPassword(actorRole, targetRole, userId, m.userId) ? (
          <button
            type="button"
            className="equipe-icon-btn"
            title="Redefinir senha"
            aria-label="Redefinir senha"
            onClick={() => setResetTarget(m)}
          >
            <KeyRound size={16} aria-hidden />
          </button>
        ) : null}
        {canRemoveTeamMember(actorRole, targetRole, userId, m.userId) ? (
          <button
            type="button"
            className="equipe-icon-btn equipe-icon-btn--danger"
            title="Remover"
            aria-label="Remover"
            onClick={() => setRemoveTarget(m)}
          >
            <Trash2 size={16} aria-hidden />
          </button>
        ) : null}
      </div>
    );
  };

  return (
    <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Equipe</h3>

      {!canManage ? (
        <p className="text-small text-muted mb-3" role="note">
          Somente titular e administradores gerenciam membros da equipe.
        </p>
      ) : null}

      <h3 className="navi-section-heading mb-2" style={{ fontSize: '1rem', marginTop: 12 }}>
        Membros da equipe
      </h3>

      <div className="card equipe-members-card">
        {!hasTeam ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            icon={Users}
            title="Equipe ainda não configurada"
            description="Salve os dados da academia primeiro."
            primaryAction={{ label: 'Ir para Estúdio', href: '/empresa?tab=estudio' }}
            role="status"
          />
        ) : (
          <>
            {membersLoadError && !loadingMembers ? (
              <div className="section-error" role="alert">
                <span>Não foi possível carregar a equipe.</span>
                <button type="button" className="btn-secondary" onClick={() => void loadMembers()}>
                  Tentar novamente
                </button>
              </div>
            ) : null}
            {loadingMembers ? (
              <div className="navi-desktop-table-wrap equipe-desktop-table-wrap">
                <table className="navi-table equipe-table" aria-busy="true" aria-label="Carregando equipe">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Papel</th>
                      <th>E-mail</th>
                      <th>Data de entrada</th>
                      <th>Status</th>
                      {canManage ? <th className="equipe-table__actions-head">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2].map((i) => (
                      <tr key={`equipe-sk-${i}`} className="equipe-table__skeleton-row" aria-hidden>
                        <td>
                          <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--name" />
                        </td>
                        <td>
                          <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--pill" />
                        </td>
                        <td>
                          <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--email" />
                        </td>
                        <td>
                          <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--date" />
                        </td>
                        <td>
                          <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--pill" />
                        </td>
                        {canManage ? (
                          <td>
                            <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--action" />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="navi-desktop-table-wrap equipe-desktop-table-wrap">
                <table className="navi-table equipe-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Papel</th>
                      <th>E-mail</th>
                      <th>Data de entrada</th>
                      <th>Status</th>
                      {canManage ? <th className="equipe-table__actions-head">Ações</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => {
                      const roleLabel = membershipRoleDisplayLabel(m, academy?.ownerId);
                      const status = membershipStatusLabel(m);
                      return (
                        <tr key={m.$id}>
                          <td>
                            <span className="equipe-table__name">{membershipPrimaryLabel(m)}</span>
                          </td>
                          <td>
                            <span className="type-pill" style={membershipRolePillStyle(roleLabel)}>
                              {roleLabel}
                            </span>
                          </td>
                          <td className="text-small text-muted">
                            {membershipSecondaryEmail(m) || String(m.userEmail || m.email || '—')}
                          </td>
                          <td className="text-small text-muted">{membershipJoinedDate(m)}</td>
                          <td>
                            <span className="type-pill" style={membershipStatusPillStyle(status)}>
                              {status}
                            </span>
                          </td>
                          {canManage ? (
                            <td className="equipe-table__actions">{renderRowActions(m)}</td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {members.length === 0 && !membersLoadError ? (
                  <EmptyState variant="compact" tone="dashed" title="Nenhum membro listado." role="status" />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {canManage && hasTeam ? (
        <>
          <div className="funil-section-divider" role="separator" aria-hidden="true" />
          <h3 className="navi-section-heading mb-2" style={{ fontSize: '1rem' }}>
            Adicionar membro
          </h3>
          <div className="card">
            <form onSubmit={handleCreateMember} className="flex-col gap-3">
              <div className="form-group">
                <label>Nome</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ex: Maria Silva"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  disabled={savingMember}
                />
              </div>
              <div className="form-group">
                <label>E-mail</label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="recepcao@academia.com"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  disabled={savingMember}
                />
              </div>
              <div className="form-group">
                <label>Papel</label>
                <select
                  className="form-input"
                  value={newMember.role}
                  onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                  disabled={savingMember || actorRole === 'admin'}
                >
                  {(isOwner ? ROLE_OPTIONS : ROLE_OPTIONS.filter((r) => r.value === 'receptionist')).map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                {actorRole === 'admin' ? (
                  <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                    Administradores só podem adicionar recepcionistas.
                  </p>
                ) : null}
              </div>
              {memberError ? <p className="field-error">{memberError}</p> : null}
              <button
                type="submit"
                className="btn-primary"
                style={{ alignSelf: 'flex-start' }}
                disabled={savingMember || !newMember.name.trim() || !newMember.email.trim()}
              >
                <Plus size={16} /> {savingMember ? 'Enviando…' : 'Adicionar membro'}
              </button>
            </form>
          </div>
        </>
      ) : null}

      {isOwner && hasTeam ? (
        <>
          <div className="funil-section-divider" role="separator" aria-hidden="true" />
          <h3 className="navi-section-heading mb-2" style={{ fontSize: '1rem' }}>
            Histórico de alterações
          </h3>
          <div className="card equipe-audit-card">
            {auditLoading && auditEvents.length === 0 ? (
              <p className="text-small text-muted">Carregando histórico…</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-small text-muted">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="equipe-audit-list">
                {auditEvents.map((ev) => (
                  <li key={ev.id} className="equipe-audit-list__item">
                    <div className="equipe-audit-list__desc">{ev.description}</div>
                    <div className="text-xs text-muted">
                      {ev.timestamp
                        ? new Date(ev.timestamp).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {auditOffset < auditTotal ? (
              <button
                type="button"
                className="btn-outline btn-sm mt-2"
                disabled={auditLoading}
                onClick={() => void loadAudit(auditOffset, true)}
              >
                {auditLoading ? 'Carregando…' : 'Carregar mais'}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {editMember && typeof document !== 'undefined'
        ? createPortal(
            <div className="navi-modal-overlay" role="presentation" onClick={() => !editSaving && setEditMember(null)}>
              <div
                className="card navi-modal-dialog"
                role="dialog"
                aria-modal="true"
                style={{ maxWidth: 440, padding: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-center gap-2" style={{ marginBottom: 12 }}>
                  <h3 className="navi-section-heading" style={{ margin: 0 }}>
                    Editar membro
                  </h3>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={() => setEditMember(null)}
                    disabled={editSaving}
                    aria-label="Fechar"
                  >
                    <X size={16} />
                  </button>
                </div>
                <form onSubmit={handleSaveEdit} className="flex-col gap-3">
                  <div className="form-group">
                    <label>Nome</label>
                    <input
                      className="form-input"
                      value={editForm.name}
                      onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                      disabled={editSaving}
                    />
                  </div>
                  {canEditField(
                    actorRole,
                    membershipTeamRole(editMember, academy?.ownerId),
                    'email',
                    userId,
                    editMember.userId
                  ) ? (
                    <div className="form-group">
                      <label>E-mail</label>
                      <input
                        className="form-input"
                        type="email"
                        value={editForm.email}
                        onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
                        disabled={editSaving || !editMember.userId}
                      />
                      {!editMember.userId ? (
                        <p className="text-xs text-muted" style={{ marginTop: 6 }}>
                          Disponível após o membro aceitar o convite.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {canEditField(
                    actorRole,
                    membershipTeamRole(editMember, academy?.ownerId),
                    'role',
                    userId,
                    editMember.userId
                  ) ? (
                    <div className="form-group">
                      <label>Papel</label>
                      <select
                        className="form-input"
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        disabled={editSaving}
                      >
                        {(isOwner
                          ? ROLE_OPTIONS
                          : ROLE_OPTIONS.filter((r) => r.value === 'receptionist')
                        ).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {editError ? <p className="field-error">{editError}</p> : null}
                  {editEmailWarning ? (
                    <p className="text-small" style={{ color: 'var(--warning, #9a7b12)' }}>
                      {editEmailWarning}
                    </p>
                  ) : null}
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => setEditMember(null)}
                      disabled={editSaving}
                    >
                      Cancelar
                    </button>
                    <button type="submit" className="btn-secondary" disabled={editSaving}>
                      {editSaving ? 'Salvando…' : 'Salvar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}

      {tempPasswordModal && typeof document !== 'undefined'
        ? createPortal(
            <div className="navi-modal-overlay" role="presentation" onClick={() => setTempPasswordModal(null)}>
              <div
                className="card navi-modal-dialog"
                role="dialog"
                aria-modal="true"
                style={{ maxWidth: 420, padding: 20 }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="navi-section-heading" style={{ margin: '0 0 8px' }}>
                  Senha provisória
                </h3>
                <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
                  Esta senha não será exibida novamente. Envie ao membro por um canal seguro.
                </p>
                <div className="equipe-temp-password-box">
                  <code>{tempPasswordModal.password}</code>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(tempPasswordModal.password);
                        addToast({ type: 'success', message: 'Senha copiada.' });
                      } catch {
                        addToast({ type: 'error', message: 'Não foi possível copiar.' });
                      }
                    }}
                  >
                    <Copy size={14} /> Copiar senha
                  </button>
                </div>
                <p className="text-xs text-muted" style={{ marginTop: 10 }}>
                  {tempPasswordModal.name} — {tempPasswordModal.email}
                </p>
                <button type="button" className="btn-secondary mt-3" onClick={() => setTempPasswordModal(null)}>
                  Fechar
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title={removeTarget ? `Remover ${membershipPrimaryLabel(removeTarget)} da equipe?` : ''}
        description="O acesso será revogado imediatamente."
        confirmLabel="Remover"
        confirmVariant="danger"
        loading={removeBusy}
        onClose={() => !removeBusy && setRemoveTarget(null)}
        onConfirm={() => void confirmRemove()}
      />

      <ConfirmDialog
        open={Boolean(resetTarget)}
        title="Redefinir senha?"
        description={
          resetTarget
            ? `Será enviado um e-mail de recuperação para ${resetTarget.userEmail || resetTarget.email || 'o membro'}.`
            : ''
        }
        confirmLabel="Enviar e-mail"
        loading={resetBusy}
        onClose={() => !resetBusy && setResetTarget(null)}
        onConfirm={() => void confirmResetPassword()}
      />
    </section>
  );
}

export default EquipeSection;
