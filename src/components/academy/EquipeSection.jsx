import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Plus, Pencil, AlertTriangle, Users } from 'lucide-react';
import { friendlyError } from '../../lib/errorMessages';
import { teams, createSessionJwt } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import EmptyState from '../shared/EmptyState.jsx';
import {
  membershipPrimaryLabel,
  membershipSecondaryEmail,
  membershipRoleDisplayLabel,
  membershipRolePillStyle,
} from '../../lib/teamMembershipLabel.js';

const ROLE_CREATED_LABEL = 'Recepcionista';

const EquipeSection = ({ academy, academyId }) => {
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const isOwner = role === 'owner';
  const hasTeam = Boolean(academy?.teamId);

  const [members, setMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [membersLoadError, setMembersLoadError] = useState(false);
  const [newMember, setNewMember] = useState({ name: '', email: '', password: '' });
  const [savingMember, setSavingMember] = useState(false);
  const [memberError, setMemberError] = useState('');
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const [editMember, setEditMember] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const loadMembers = useCallback(async () => {
    if (!academy?.teamId) return;
    setMembersLoadError(false);
    setLoadingMembers(true);
    try {
      const result = await teams.listMemberships(academy.teamId);
      setMembers(result.memberships || []);
    } catch (e) {
      console.error('loadMembers error:', e);
      setMembersLoadError(true);
      setMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [academy?.teamId]);

  useEffect(() => {
    if (!academy?.teamId) {
      setMembers([]);
      setMembersLoadError(false);
      return;
    }
    void loadMembers();
  }, [academy?.teamId, loadMembers]);

  const handleCreateMember = async (e) => {
    e.preventDefault();
    setMemberError('');

    if (!hasTeam) {
      setMemberError('Equipe ainda não configurada. Salve os dados da academia primeiro.');
      return;
    }

    if (!newMember.name || !newMember.email || !newMember.password) {
      setMemberError('Preencha todos os campos.');
      return;
    }
    if (newMember.password.length < 8) {
      setMemberError('A senha deve ter no mínimo 8 caracteres.');
      return;
    }

    setSavingMember(true);
    try {
      const jwt = await createSessionJwt();
      if (!String(jwt || '').trim()) {
        setMemberError('Sessão expirada, faça login novamente.');
        return;
      }
      const res = await fetch('/api/team/members', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          name: newMember.name,
          email: newMember.email,
          password: newMember.password,
          teamId: academy.teamId,
          academyId: String(academyId || '').trim(),
        }),
      });

      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        let msg = data.erro || 'Erro ao criar usuário';
        if (res.status === 401) msg = 'Sessão expirada, faça login novamente.';
        else if (res.status === 403) msg = 'Você não tem permissão para adicionar membros.';
        else if (res.status === 409) msg = 'Já existe uma conta com este e-mail.';
        throw new Error(msg);
      }

      const createdRoleLabel = String(data.roleLabel || ROLE_CREATED_LABEL).trim() || ROLE_CREATED_LABEL;

      const result = await teams.listMemberships(academy.teamId);
      let list = result.memberships || [];
      const mid = String(data.memberId || '').trim();
      if (mid) {
        const dn = String(data.displayName || newMember.name || '').trim();
        const em = String(data.memberEmail || newMember.email || '').trim();
        list = list.map((mem) => {
          if (String(mem.userId || '').trim() !== mid) return mem;
          return {
            ...mem,
            ...(dn ? { userName: dn } : {}),
            ...(em ? { userEmail: em } : {}),
          };
        });
      }
      setMembers(list);
      setNewMember({ name: '', email: '', password: '' });
      addToast({ type: 'success', message: `${createdRoleLabel} criado com sucesso!` });
    } catch (error) {
      const raw = String(error?.message || '').trim();
      const useRaw =
        raw === 'Sessão expirada, faça login novamente.' ||
        raw === 'Você não tem permissão para adicionar membros.' ||
        raw === 'Já existe uma conta com este e-mail.';
      setMemberError(
        useRaw ? raw : friendlyError(error, 'action') || 'Não foi possível salvar o membro.'
      );
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (membershipId) => {
    setRemoveConfirm({ membershipId });
  };

  const openEditMember = (m) => {
    setEditError('');
    const label = membershipPrimaryLabel(m);
    setEditName(label === 'Usuário' ? '' : label);
    setEditMember({ userId: m.userId });
  };

  const handleSaveEditName = async (e) => {
    e.preventDefault();
    setEditError('');
    const trimmed = String(editName || '').trim();
    if (!trimmed) {
      setEditError('Informe o nome.');
      return;
    }
    if (!editMember?.userId) return;
    setEditSaving(true);
    try {
      const jwt = await createSessionJwt();
      if (!String(jwt || '').trim()) {
        setEditError('Sessão expirada, faça login novamente.');
        return;
      }
      const res = await fetch('/api/team/members', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          academyId: String(academyId || '').trim(),
          teamId: academy.teamId,
          userId: editMember.userId,
          name: trimmed,
        }),
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        let msg = data.erro || 'Não foi possível atualizar o nome.';
        if (res.status === 401) msg = 'Sessão expirada, faça login novamente.';
        if (res.status === 403) msg = 'Você não tem permissão para editar este membro.';
        throw new Error(msg);
      }
      const dn = String(data.displayName || trimmed).trim();
      setMembers((prev) =>
        prev.map((mem) => (mem.userId === editMember.userId ? { ...mem, userName: dn } : mem))
      );
      setEditMember(null);
      addToast({ type: 'success', message: 'Nome atualizado.' });
    } catch (error) {
      const raw = String(error?.message || '').trim();
      const useRaw =
        raw === 'Sessão expirada, faça login novamente.' ||
        raw === 'Você não tem permissão para editar este membro.';
      setEditError(
        useRaw ? raw : friendlyError(error, 'action') || 'Não foi possível atualizar o nome.'
      );
    } finally {
      setEditSaving(false);
    }
  };

  const memberIsTitular = (m) => {
    const roleLabel = membershipRoleDisplayLabel(m, academy?.ownerId);
    return roleLabel === 'Titular';
  };

  return (
    <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Equipe</h3>

      {!isOwner ? (
        <div className="equipe-owner-alert" role="note">
          <AlertTriangle size={16} aria-hidden />
          <span>Somente o titular pode adicionar ou remover membros.</span>
        </div>
      ) : null}

      <h3 className="navi-section-heading mb-2" style={{ fontSize: '1rem', marginTop: isOwner ? 16 : 12 }}>
        Membros da equipe
      </h3>

      <div className="card">
        {!hasTeam ? (
          <EmptyState
            variant="compact"
            tone="dashed"
            icon={Users}
            title="Equipe ainda não configurada"
            description="Salve os dados da academia primeiro."
            primaryAction={{
              label: 'Ir para Estúdio',
              href: '/empresa?tab=estudio',
            }}
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
              <p className="text-small text-muted">Carregando equipe…</p>
            ) : (
              <div className="flex-col gap-1">
                {members.map((m) => {
                  const roleLabel = membershipRoleDisplayLabel(m, academy?.ownerId);
                  const pillStyle = membershipRolePillStyle(roleLabel);
                  const titular = memberIsTitular(m);
                  return (
                    <div
                      key={m.$id}
                      className="info-row"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <span
                          className="info-row-label"
                          style={{ display: 'block', textTransform: 'none', color: 'var(--text)' }}
                        >
                          {membershipPrimaryLabel(m)}
                        </span>
                        {membershipSecondaryEmail(m) ? (
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                            {membershipSecondaryEmail(m)}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="type-pill" style={pillStyle}>
                          {roleLabel}
                        </span>
                        {isOwner && !titular ? (
                          <>
                            <button
                              type="button"
                              className="icon-btn icon-only"
                              title="Editar nome"
                              onClick={() => openEditMember(m)}
                            >
                              <Pencil size={16} color="var(--text-muted)" />
                            </button>
                            <button
                              type="button"
                              className="icon-btn icon-btn-remove icon-only"
                              title="Remover membro"
                              onClick={() => handleRemoveMember(m.$id)}
                            >
                              <Trash2 size={16} color="var(--danger)" />
                            </button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
                {members.length === 0 && !membersLoadError ? (
                  <EmptyState variant="compact" tone="dashed" title="Nenhum membro listado." role="status" />
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {isOwner ? (
        <>
          <div className="funil-section-divider" role="separator" aria-hidden="true" />

          <h3 className="navi-section-heading mb-2" style={{ fontSize: '1rem' }}>
            Adicionar membro
          </h3>

          <div className="card">
            <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
              Cria uma conta de acesso para recepção ou operação do dia a dia. O papel atribuído será{' '}
              <strong>Recepcionista</strong>.
            </p>
            <form onSubmit={handleCreateMember} className="flex-col gap-3">
              <div className="form-group">
                <label>Nome completo</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="Ex: João Silva"
                  value={newMember.name}
                  onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                  disabled={!hasTeam || savingMember}
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
                  disabled={!hasTeam || savingMember}
                />
              </div>
              <div className="form-group">
                <label>Senha provisória</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="Mínimo 8 caracteres"
                  value={newMember.password}
                  onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                  disabled={!hasTeam || savingMember}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted" style={{ marginTop: 6, lineHeight: 1.45 }}>
                  Esta senha é temporária. Oriente o novo membro a alterá-la no primeiro acesso.
                </p>
              </div>
              {!hasTeam ? (
                <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                  Equipe ainda não configurada.{' '}
                  <Link to="/empresa?tab=estudio" className="edit-link">
                    Salve os dados da academia
                  </Link>{' '}
                  no Estúdio antes de adicionar membros.
                </p>
              ) : null}
              {memberError ? <p className="field-error">{memberError}</p> : null}
              <button
                type="submit"
                className="btn-primary"
                style={{ alignSelf: 'flex-start' }}
                disabled={
                  !hasTeam ||
                  savingMember ||
                  !newMember.name.trim() ||
                  !newMember.email.trim() ||
                  !newMember.password.trim()
                }
              >
                <Plus size={16} /> {savingMember ? 'Criando…' : 'Adicionar membro'}
              </button>
            </form>
          </div>
        </>
      ) : null}

      {editMember ? (
        <div className="confirm-overlay" onClick={() => !editSaving && setEditMember(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="navi-section-heading">Nome do membro</h3>
            <p className="navi-subtitle" style={{ marginTop: 8 }}>
              Atualiza o nome exibido no sistema e nas tarefas.
            </p>
            <form onSubmit={handleSaveEditName} className="flex-col gap-3" style={{ marginTop: 14 }}>
              <div className="form-group">
                <label>Nome completo</label>
                <input
                  className="form-input"
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  disabled={editSaving}
                />
              </div>
              {editError ? <p className="field-error">{editError}</p> : null}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn-outline"
                  disabled={editSaving}
                  onClick={() => setEditMember(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn-primary" disabled={editSaving}>
                  {editSaving ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {removeConfirm ? (
        <div className="confirm-overlay" onClick={() => setRemoveConfirm(null)}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-icon-wrap">
              <Trash2 size={20} color="var(--danger)" />
            </div>
            <h3 className="navi-section-heading">Remover membro?</h3>
            <p className="navi-subtitle" style={{ marginTop: 8 }}>
              Este acesso será revogado imediatamente.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button type="button" className="btn-outline" onClick={() => setRemoveConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={async () => {
                  try {
                    await teams.deleteMembership(academy.teamId, removeConfirm.membershipId);
                    setMembers((prev) => prev.filter((m) => m.$id !== removeConfirm.membershipId));
                    addToast({ type: 'success', message: 'Membro removido.' });
                  } catch (e) {
                    console.error('Erro ao remover:', e);
                    addToast({ type: 'error', message: 'Não foi possível remover o membro.' });
                  } finally {
                    setRemoveConfirm(null);
                  }
                }}
              >
                Remover
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .equipe-owner-alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 4px;
          border-radius: 8px;
          background: rgba(148, 163, 184, 0.12);
          border: 1px solid var(--border-light);
          font-size: 0.85rem;
          line-height: 1.45;
          color: var(--text-secondary);
          font-weight: 500;
        }
        .equipe-owner-alert svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: var(--text-muted);
        }
      `,
        }}
      />
    </section>
  );
};

export default EquipeSection;
