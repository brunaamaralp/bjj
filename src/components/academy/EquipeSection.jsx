import React, { useState, useEffect, useCallback } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { friendlyError } from '../../lib/errorMessages';
import { teams } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { authService } from '../../lib/auth';
import { useUserRole } from '../../lib/useUserRole';

const EquipeSection = ({ academy, academyId }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);

    const [members, setMembers] = useState([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [membersLoadError, setMembersLoadError] = useState(false);
    const [newMember, setNewMember] = useState({ name: '', email: '', password: '' });
    const [savingMember, setSavingMember] = useState(false);
    const [memberError, setMemberError] = useState('');
    const [removeConfirm, setRemoveConfirm] = useState(null);

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
            const jwt = await authService.createSessionJwt();
            const res = await fetch('/api/team/members', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${jwt}`
                },
                body: JSON.stringify({
                    name: newMember.name,
                    email: newMember.email,
                    password: newMember.password,
                    teamId: academy.teamId,
                    academyId: String(academyId || '').trim()
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.erro || 'Erro ao criar usuário');

            const result = await teams.listMemberships(academy.teamId);
            setMembers(result.memberships || []);
            setNewMember({ name: '', email: '', password: '' });
            addToast({ type: 'success', message: 'Recepcionista criado com sucesso!' });
        } catch (error) {
            setMemberError(friendlyError(error, 'action') || 'Não foi possível salvar o membro.');
        } finally {
            setSavingMember(false);
        }
    };

    const handleRemoveMember = async (membershipId) => {
        setRemoveConfirm({ membershipId });
    };

    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <h3 className="navi-section-heading mb-2">Equipe</h3>
            <div className="card">
                {academy.teamId ? (
                    <div className="flex-col gap-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="navi-section-heading" style={{ fontSize: '0.95rem' }}>Membros</span>
                            </div>
                            {membersLoadError && !loadingMembers && (
                                <div className="section-error" role="alert">
                                    <span>Não foi possível carregar a equipe.</span>
                                    <button type="button" className="btn-secondary" onClick={() => void loadMembers()}>
                                        Tentar novamente
                                    </button>
                                </div>
                            )}
                            {loadingMembers ? (
                                <p className="text-small" style={{ color: 'var(--text-muted)' }}>Carregando equipe...</p>
                            ) : (
                                <div className="flex-col gap-1">
                                    {members.map(m => {
                                        const isOwner = (m.roles || []).includes('owner');
                                        return (
                                            <div key={m.$id} className="info-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <span className="info-row-label" style={{ display: 'block', textTransform: 'none', color: 'var(--text)' }}>
                                                        {m.userName || 'Usuário'}
                                                    </span>
                                                    <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{m.userEmail}</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="type-pill" style={{ background: isOwner ? 'var(--accent-light)' : 'var(--surface-hover)', color: isOwner ? 'var(--accent)' : 'var(--text-secondary)' }}>
                                                        {isOwner ? 'Dono' : 'Recepcionista'}
                                                    </span>
                                                    {role === 'owner' && !isOwner && (
                                                        <button
                                                            type="button"
                                                            className="icon-btn icon-btn-remove icon-only"
                                                            title="Remover membro"
                                                            onClick={() => handleRemoveMember(m.$id)}
                                                        >
                                                            <Trash2 size={16} color="var(--danger)" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                    {members.length === 0 && (
                                        <div className="navi-subtitle" style={{ marginTop: 0 }}>Nenhum membro listado.</div>
                                    )}
                                </div>
                            )}
                        </div>

                        {role === 'owner' && (
                            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px' }}>
                                <span className="navi-section-heading" style={{ fontSize: '0.95rem', display: 'block', marginBottom: 8 }}>Adicionar Recepcionista</span>
                                <form onSubmit={handleCreateMember} className="flex-col gap-3">
                                    <div className="form-group">
                                        <label>Nome completo</label>
                                        <input
                                            className="form-input"
                                            type="text"
                                            placeholder="Ex: João Silva"
                                            value={newMember.name}
                                            onChange={e => setNewMember({ ...newMember, name: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>E-mail</label>
                                        <input
                                            className="form-input"
                                            type="email"
                                            placeholder="recepcao@academia.com"
                                            value={newMember.email}
                                            onChange={e => setNewMember({ ...newMember, email: e.target.value })}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Senha Provisória</label>
                                        <input
                                            className="form-input"
                                            type="password"
                                            placeholder="Mínimo 8 caracteres"
                                            value={newMember.password}
                                            onChange={e => setNewMember({ ...newMember, password: e.target.value })}
                                        />
                                    </div>
                                    {memberError && <p className="field-error">{memberError}</p>}
                                    <button
                                        type="submit"
                                        className="btn-secondary mt-1"
                                        disabled={
                                            savingMember ||
                                            !newMember.name.trim() ||
                                            !newMember.email.trim() ||
                                            !newMember.password.trim()
                                        }
                                    >
                                        <Plus size={16} /> {savingMember ? 'Criando...' : 'Adicionar Conta'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="navi-subtitle" style={{ marginTop: 0 }}>
                        Não foi possível identificar sua equipe. Entre em contato com o suporte se o problema persistir.
                    </div>
                )}
            </div>
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
                            <button type="button" className="btn-outline" onClick={() => setRemoveConfirm(null)}>Cancelar</button>
                            <button
                                type="button"
                                className="btn-danger"
                                onClick={async () => {
                                    try {
                                        await teams.deleteMembership(academy.teamId, removeConfirm.membershipId);
                                        setMembers(prev => prev.filter(m => m.$id !== removeConfirm.membershipId));
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
        </section>
    );
};

export default EquipeSection;
