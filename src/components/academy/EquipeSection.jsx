import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Trash2, Plus, Pencil, KeyRound, Users, Copy, UserPlus, UserMinus } from 'lucide-react';
import { teams } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import EmptyState from '../shared/EmptyState.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import FieldError from '../shared/FieldError.jsx';
import {
  membershipPrimaryLabel,
  membershipSecondaryEmail,
  membershipRoleDisplayLabel,
  membershipStatusLabel,
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
import { friendlyError } from '../../lib/errorMessages.js';
import useMatchMobile from '../../hooks/useMatchMobile.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import FormSelect from '../shared/FormSelect.jsx';
import SectionHeader from '../layout/SectionHeader.jsx';

const ROLE_OPTIONS = [
  { value: 'receptionist', label: 'Recepcionista' },
  { value: 'admin', label: 'Administrador' },
];

function memberInitial(m) {
  const label = membershipPrimaryLabel(m);
  const ch = String(label || '?').trim().charAt(0);
  return ch ? ch.toUpperCase() : '?';
}

function equipeRolePillClass(roleLabel) {
  if (roleLabel === 'Titular') return 'equipe-pill equipe-pill--owner';
  if (roleLabel === 'Administrador') return 'equipe-pill equipe-pill--admin';
  return 'equipe-pill equipe-pill--member';
}

function equipeStatusPillClass(status) {
  if (status === 'Convite pendente') return 'equipe-pill equipe-pill--pending';
  return 'equipe-pill equipe-pill--active';
}

function auditEventIcon(type) {
  const t = String(type || '').trim();
  if (t === 'team_member_added') return UserPlus;
  if (t === 'team_member_removed') return UserMinus;
  if (t === 'team_member_password_reset') return KeyRound;
  return Pencil;
}

function auditIconModifier(type) {
  const t = String(type || '').trim();
  if (t === 'team_member_added') return 'added';
  if (t === 'team_member_removed') return 'removed';
  return 'updated';
}

function EquipeSection({ academy, academyId, onMetaChange }) {
  const addToast = useUiStore((s) => s.addToast);
  const userId = useLeadStore((s) => s.userId);
  const hasTeam = Boolean(academy?.teamId);
  const isMobile = useMatchMobile();

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
      } else if (data.readded) {
        addToast({
          type: 'success',
          message: `${data.displayName || newMember.name} readicionado à equipe. O acesso usa a conta existente.`,
        });
      } else {
        addToast({ type: 'success', message: `${data.roleLabel || 'Membro'} adicionado.` });
      }
      if (isOwner) void loadAudit(0, false);
    } catch (error) {
      const status = error?.status;
      let msg = friendlyError(error, 'save');
      if (status === 401) msg = 'Sessão expirada, faça login novamente.';
      if (status === 403) msg = 'Você não tem permissão para adicionar membros.';
      if (status === 409) {
        msg = error?.data?.erro || 'Este e-mail já faz parte da equipe ou não pode ser adicionado agora.';
      }
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
      let msg = friendlyError(error, 'save');
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
        message: friendlyError(error, 'delete'),
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
        message: friendlyError(error, 'send'),
      });
    } finally {
      setResetBusy(false);
      setResetTarget(null);
    }
  };

  const memberRowHasActions = useCallback(
    (m) => {
      const targetRole = membershipTeamRole(m, academy?.ownerId);
      return (
        canEditTeamMember(actorRole, targetRole, userId, m.userId) ||
        canRemoveTeamMember(actorRole, targetRole, userId, m.userId) ||
        canResetTeamPassword(actorRole, targetRole, userId, m.userId)
      );
    },
    [actorRole, academy?.ownerId, userId]
  );

  const { ownerMember, staffMembers } = useMemo(() => {
    let owner = null;
    const staff = [];
    for (const m of members) {
      if (membershipTeamRole(m, academy?.ownerId) === 'owner') owner = m;
      else staff.push(m);
    }
    return { ownerMember: owner, staffMembers: staff };
  }, [members, academy?.ownerId]);

  const showActionsColumn = useMemo(() => {
    if (!canManage) return false;
    return staffMembers.some((m) => memberRowHasActions(m));
  }, [canManage, staffMembers, memberRowHasActions]);

  const renderRowActions = (m) => {
    if (!memberRowHasActions(m)) return null;
    const targetRole = membershipTeamRole(m, academy?.ownerId);

    return (
      <div className="equipe-table__actions-inner">
        {canEditTeamMember(actorRole, targetRole, userId, m.userId) ? (
          <button
            type="button"
            className="btn-action-ghost"
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
            className="btn-action-ghost"
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
            className="btn-action-ghost btn-action-ghost--danger"
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

  const memberCountLabel =
    staffMembers.length === 0
      ? 'Nenhum colaborador além do titular'
      : staffMembers.length === 1
        ? '1 colaborador na equipe'
        : `${staffMembers.length} colaboradores na equipe`;

  useEffect(() => {
    if (!onMetaChange) return;
    if (!hasTeam) {
      onMetaChange(null);
      return;
    }
    onMetaChange(memberCountLabel);
  }, [hasTeam, memberCountLabel, onMetaChange]);

  const renderOwnerCard = () => {
    if (!ownerMember) return null;
    const roleLabel = membershipRoleDisplayLabel(ownerMember, academy?.ownerId);
    const email =
      membershipSecondaryEmail(ownerMember) || String(ownerMember.userEmail || ownerMember.email || '—');
    const isYou = String(ownerMember.userId || '') === String(userId || '');

    const name = membershipPrimaryLabel(ownerMember);

    return (
      <div className="equipe-owner-card" role="group" aria-label="Titular da academia">
        <div className="equipe-owner-card__main">
          <span className="equipe-avatar equipe-avatar--owner" aria-hidden>
            {memberInitial(ownerMember)}
          </span>
          <div className="equipe-owner-card__text">
            <div className="equipe-owner-card__name">
              {name}
              {isYou ? <span className="equipe-owner-card__you">Você</span> : null}
            </div>
            <div className="text-small text-muted equipe-owner-card__email">{email}</div>
          </div>
        </div>
        <span className={equipeRolePillClass(roleLabel)}>{roleLabel}</span>
      </div>
    );
  };

  const renderOwnerTableRow = () => {
    if (!ownerMember) return null;
    const roleLabel = membershipRoleDisplayLabel(ownerMember, academy?.ownerId);
    const status = membershipStatusLabel(ownerMember);
    const email =
      membershipSecondaryEmail(ownerMember) || String(ownerMember.userEmail || ownerMember.email || '—');
    const isYou = String(ownerMember.userId || '') === String(userId || '');
    const name = membershipPrimaryLabel(ownerMember);

    return (
      <tr className="equipe-table__owner-row">
        <td>
          <div className="equipe-table__name-cell">
            <span className="equipe-avatar equipe-avatar--owner" aria-hidden>
              {memberInitial(ownerMember)}
            </span>
            <span className="equipe-table__name">
              {name}
              {isYou ? <span className="equipe-owner-card__you">Você</span> : null}
            </span>
          </div>
        </td>
        <td>
          <span className={equipeRolePillClass(roleLabel)}>{roleLabel}</span>
        </td>
        <td className="text-small text-muted">{email}</td>
        <td className="text-small text-muted navi-mono-date">{membershipJoinedDate(ownerMember)}</td>
        <td>
          <span className={equipeStatusPillClass(status)}>{status}</span>
        </td>
        {showActionsColumn ? <td className="equipe-table__actions" aria-hidden="true" /> : null}
      </tr>
    );
  };

  const equipeTableHead = (
    <thead>
      <tr>
        <th className="equipe-table__col-name">Nome</th>
        <th className="equipe-table__col-role">Papel</th>
        <th className="equipe-table__col-email">E-mail</th>
        <th className="equipe-table__col-date">Data de entrada</th>
        <th className="equipe-table__col-status">Status</th>
        {showActionsColumn ? <th className="equipe-table__actions-head equipe-table__col-actions">Ações</th> : null}
      </tr>
    </thead>
  );

  const roleOptionsForAdd = isOwner
    ? ROLE_OPTIONS
    : ROLE_OPTIONS.filter((r) => r.value === 'receptionist');

  return (
    <section className="equipe-section animate-in">
      {!canManage ? (
        <StatusBanner
          variant="info"
          message="Somente titular e administradores gerenciam membros da equipe."
          className="equipe-section__banner"
        />
      ) : null}

      {canManage && hasTeam ? (
        <div className="page-header-card equipe-invite-panel">
          <div className="equipe-invite-panel__head">
            <p className="navi-eyebrow">Convidar colaborador</p>
            <p className="text-small text-muted equipe-invite-panel__lead">
              Envie um convite por e-mail ou readicione quem já teve acesso à academia.
            </p>
          </div>
          <form onSubmit={handleCreateMember} className="equipe-invite-form">
            <div className="equipe-invite-form__grid">
              <div className="equipe-field">
                <label htmlFor="equipe-add-name">Nome</label>
                <input
                  id="equipe-add-name"
                  className="form-input"
                  type="text"
                  placeholder="Ex: Maria Silva"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  disabled={savingMember}
                  autoComplete="name"
                />
              </div>
              <div className="equipe-field">
                <label htmlFor="equipe-add-email">E-mail</label>
                <input
                  id="equipe-add-email"
                  className="form-input"
                  type="email"
                  placeholder="recepcao@academia.com"
                  value={newMember.email}
                  onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                  disabled={savingMember}
                  autoComplete="email"
                />
              </div>
              <div className="equipe-field">
                <label htmlFor="equipe-add-role">Papel</label>
                <select
                  id="equipe-add-role"
                  className="form-input"
                  value={newMember.role}
                  onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                  disabled={savingMember || actorRole === 'admin'}
                >
                  {roleOptionsForAdd.map((o) => (
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
            </div>
            <div className="equipe-invite-form__footer">
              {memberError ? <FieldError className="equipe-invite-form__error">{memberError}</FieldError> : null}
              <button
                type="submit"
                className="btn-action-primary"
                disabled={savingMember || !newMember.name.trim() || !newMember.email.trim()}
              >
                <Plus size={16} aria-hidden /> {savingMember ? 'Enviando…' : 'Enviar convite'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <div className="equipe-panel">
        <div className="equipe-panel__head">
          <SectionHeader
            as="h2"
            title="Colaboradores"
            subtitle={hasTeam ? memberCountLabel : 'Configure a academia para listar a equipe.'}
          />
        </div>
        <div className="equipe-panel__body">
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
              <ErrorBanner
                message="Não foi possível carregar a equipe."
                onRetry={() => void loadMembers()}
              />
            ) : null}
            {loadingMembers ? (
              isMobile ? (
                <PageSkeleton variant="list" rows={4} />
              ) : (
              <div className="navi-desktop-table-wrap equipe-desktop-table-wrap">
                <table className="navi-table equipe-table" aria-busy="true" aria-label="Carregando equipe">
                  {equipeTableHead}
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
                        {showActionsColumn ? (
                          <td>
                            <span className="equipe-table__skeleton-bar equipe-table__skeleton-bar--action" />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              )
            ) : isMobile ? (
              <>
                {renderOwnerCard()}
                <div className="equipe-mobile-list">
                {staffMembers.map((m) => {
                  const roleLabel = membershipRoleDisplayLabel(m, academy?.ownerId);
                  const status = membershipStatusLabel(m);
                  const email = membershipSecondaryEmail(m) || String(m.userEmail || m.email || '—');
                  const targetRole = membershipTeamRole(m, academy?.ownerId);
                  const showActions = canManage && memberRowHasActions(m);
                  return (
                    <article key={m.$id} className="equipe-mobile-card">
                      <div className="equipe-mobile-card__head">
                        <span className="equipe-avatar" aria-hidden>
                          {memberInitial(m)}
                        </span>
                        <div className="equipe-mobile-card__body">
                          <div className="equipe-mobile-card__name">{membershipPrimaryLabel(m)}</div>
                          <div className="equipe-mobile-card__email text-small text-muted">{email}</div>
                          <div className="equipe-mobile-card__meta text-small text-muted">
                            Entrada: {membershipJoinedDate(m)}
                          </div>
                        </div>
                        <div className="equipe-mobile-card__badges">
                          <span className={equipeRolePillClass(roleLabel)}>{roleLabel}</span>
                          <span className={equipeStatusPillClass(status)}>{status}</span>
                        </div>
                      </div>
                      {showActions ? (
                        <div className="equipe-mobile-card__actions">
                          {canEditTeamMember(actorRole, targetRole, userId, m.userId) ? (
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => openEditMember(m)}
                            >
                              <Pencil size={16} aria-hidden /> Editar
                            </button>
                          ) : null}
                          {canResetTeamPassword(actorRole, targetRole, userId, m.userId) ? (
                            <button
                              type="button"
                              className="btn-outline"
                              onClick={() => setResetTarget(m)}
                            >
                              <KeyRound size={16} aria-hidden /> Senha
                            </button>
                          ) : null}
                          {canRemoveTeamMember(actorRole, targetRole, userId, m.userId) ? (
                            <button
                              type="button"
                              className="btn-outline equipe-action--danger"
                              onClick={() => setRemoveTarget(m)}
                            >
                              <Trash2 size={16} aria-hidden /> Remover
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {staffMembers.length === 0 && !membersLoadError ? (
                  <EmptyState
                    variant="compact"
                    tone="dashed"
                    title="Nenhum colaborador convidado."
                    description="Use o formulário acima para convidar recepcionistas ou administradores."
                    role="status"
                  />
                ) : null}
              </div>
              </>
            ) : (
              <div className="navi-desktop-table-wrap equipe-desktop-table-wrap">
                <table className="navi-table equipe-table">
                  {equipeTableHead}
                  <tbody>
                    {renderOwnerTableRow()}
                    {staffMembers.map((m) => {
                      const roleLabel = membershipRoleDisplayLabel(m, academy?.ownerId);
                      const status = membershipStatusLabel(m);
                      return (
                        <tr key={m.$id}>
                          <td>
                            <div className="equipe-table__name-cell">
                              <span className="equipe-avatar" aria-hidden>
                                {memberInitial(m)}
                              </span>
                              <span className="equipe-table__name">{membershipPrimaryLabel(m)}</span>
                            </div>
                          </td>
                          <td>
                            <span className={equipeRolePillClass(roleLabel)}>{roleLabel}</span>
                          </td>
                          <td className="text-small text-muted">
                            {membershipSecondaryEmail(m) || String(m.userEmail || m.email || '—')}
                          </td>
                          <td className="text-small text-muted navi-mono-date">
                            {membershipJoinedDate(m)}
                          </td>
                          <td>
                            <span className={equipeStatusPillClass(status)}>{status}</span>
                          </td>
                          {showActionsColumn ? (
                            <td className="equipe-table__actions">{renderRowActions(m)}</td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {staffMembers.length === 0 && !membersLoadError ? (
                  <EmptyState
                    variant="compact"
                    tone="dashed"
                    title="Nenhum colaborador convidado."
                    description="Use o formulário acima para convidar recepcionistas ou administradores."
                    role="status"
                  />
                ) : null}
              </div>
            )}
          </>
        )}
        </div>
      </div>

      {isOwner && hasTeam ? (
        <details className="page-header-card equipe-audit-details" open={auditEvents.length > 0}>
          <summary>
            <span>
              Histórico de alterações
              <span className="equipe-audit-details__subtitle">Convites, papéis e remoções da equipe</span>
            </span>
          </summary>
          <div className="equipe-audit-details__body">
            {auditLoading && auditEvents.length === 0 ? (
              <p className="text-small text-muted">Carregando histórico…</p>
            ) : auditEvents.length === 0 ? (
              <p className="text-small text-muted">Nenhuma alteração registrada ainda.</p>
            ) : (
              <ul className="equipe-audit-timeline">
                {auditEvents.map((ev) => {
                  const Icon = auditEventIcon(ev.event_type);
                  const mod = auditIconModifier(ev.event_type);
                  return (
                    <li key={ev.id} className="equipe-audit-timeline__item">
                      <span
                        className={`equipe-audit-timeline__icon equipe-audit-timeline__icon--${mod}`}
                        aria-hidden
                      >
                        <Icon size={16} />
                      </span>
                      <div className="equipe-audit-timeline__content">
                        <div className="equipe-audit-timeline__desc">{ev.description}</div>
                        <time
                          className="equipe-audit-timeline__time"
                          dateTime={ev.timestamp || undefined}
                        >
                          {ev.timestamp
                            ? new Date(ev.timestamp).toLocaleString('pt-BR', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </time>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {auditOffset < auditTotal ? (
              <button
                type="button"
                className="btn-outline btn-sm equipe-audit-details__more"
                disabled={auditLoading}
                onClick={() => void loadAudit(auditOffset, true)}
              >
                {auditLoading ? 'Carregando…' : 'Carregar mais'}
              </button>
            ) : null}
          </div>
        </details>
      ) : null}

      <ModalShell
        open={Boolean(editMember)}
        title="Editar membro"
        onClose={() => !editSaving && setEditMember(null)}
        maxWidth={440}
      >
        {editMember ? (
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
                      <FormSelect
                        value={editForm.role}
                        onChange={(role) => setEditForm((f) => ({ ...f, role }))}
                        disabled={editSaving}
                        emptyLabel="Selecione o papel…"
                        options={
                          isOwner
                            ? ROLE_OPTIONS
                            : ROLE_OPTIONS.filter((r) => r.value === 'receptionist')
                        }
                      />
                    </div>
                  ) : null}
                  {editError ? <FieldError>{editError}</FieldError> : null}
                  {editEmailWarning ? (
                    <p className="text-small" style={{ color: 'var(--warning, #9a7b12)' }}>
                      {editEmailWarning}
                    </p>
                  ) : null}
                  <div className="navi-modal-shell__footer" style={{ marginTop: 0 }}>
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
        ) : null}
      </ModalShell>

      <ModalShell
        open={Boolean(tempPasswordModal)}
        title="Senha provisória"
        onClose={() => setTempPasswordModal(null)}
        maxWidth={420}
        footer={
          <button type="button" className="btn-secondary" onClick={() => setTempPasswordModal(null)}>
            Fechar
          </button>
        }
      >
        {tempPasswordModal ? (
          <>
            <p className="text-small text-muted" style={{ margin: 0, lineHeight: 1.45 }}>
              Esta senha não será exibida novamente. Envie ao membro por um canal seguro.
            </p>
            <div className="equipe-temp-password-box">
              <code>{tempPasswordModal.password}</code>
              <button
                type="button"
                className="btn-outline navi-btn--toolbar"
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
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              {tempPasswordModal.name} — {tempPasswordModal.email}
            </p>
          </>
        ) : null}
      </ModalShell>

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
