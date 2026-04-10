import React, { useState, useEffect } from 'react';
import { Download, Trash2, ChevronRight, Info, Plus } from 'lucide-react';
import { teams } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { authService } from '../../lib/auth';
import { useUserRole } from '../../lib/useUserRole';
import ExportButton from '../ExportButton';

const GerenciamentoSection = ({ academy, leads }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    
    // Team states
    const [members, setMembers] = useState([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    
    const [newMember, setNewMember] = useState({ name: '', email: '', password: '' });
    const [savingMember, setSavingMember] = useState(false);
    const [memberError, setMemberError] = useState('');

    // Clear data states
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearConfirmText, setClearConfirmText] = useState('');
    const [clearingAllData, setClearingAllData] = useState(false);

    useEffect(() => {
        if (!academy?.teamId) {
            setMembers([]);
            return;
        }
        const loadMembers = async () => {
            setLoadingMembers(true);
            try {
                const result = await teams.listMemberships(academy.teamId);
                setMembers(result.memberships || []);
            } catch (e) {
                console.error('loadMembers error:', e);
                setMembers([]);
            } finally {
                setLoadingMembers(false);
            }
        };
        loadMembers();
    }, [academy?.teamId]);

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
                    teamId: academy.teamId
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.erro || 'Erro ao criar usuário');

            // Recarregar membros
            const result = await teams.listMemberships(academy.teamId);
            setMembers(result.memberships || []);
            
            // Limpar formulário
            setNewMember({ name: '', email: '', password: '' });
            addToast({ type: 'success', message: 'Recepcionista criado com sucesso!' });
        } catch (error) {
            setMemberError(error.message);
        } finally {
            setSavingMember(false);
        }
    };

    const handleRemoveMember = async (membershipId) => {
        if (!window.confirm('Remover este membro da equipe?')) return;
        try {
            await teams.deleteMembership(academy.teamId, membershipId);
            setMembers(prev => prev.filter(m => m.$id !== membershipId));
            addToast({ type: 'success', message: 'Membro removido.' });
        } catch (e) {
            console.error('Erro ao remover:', e);
            addToast({ type: 'error', message: 'Não foi possível remover o membro.' });
        }
    };

    const clearAllData = async () => {
        if (clearConfirmText.trim().toUpperCase() !== 'LIMPAR') {
            addToast({ type: 'error', message: 'Digite LIMPAR para confirmar a exclusão total.' });
            return;
        }
        if (clearingAllData) return;
        setClearingAllData(true);
        const ids = leads.map((lead) => lead.id).filter(Boolean);
        const BATCH_SIZE = 8;
        let failedCount = 0;
        try {
            for (let i = 0; i < ids.length; i += BATCH_SIZE) {
                const chunk = ids.slice(i, i + BATCH_SIZE);
                const results = await Promise.allSettled(
                    chunk.map((leadId) => useLeadStore.getState().deleteLead(leadId))
                );
                failedCount += results.filter((r) => r.status === 'rejected').length;
            }
            if (failedCount > 0) {
                addToast({ type: 'error', message: `${failedCount} registros não puderam ser removidos.` });
            } else {
                addToast({ type: 'success', message: 'Todos os dados foram removidos.' });
            }
        } finally {
            setClearingAllData(false);
        }
        setShowClearConfirm(false);
        setClearConfirmText('');
    };

    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <h3 className="navi-section-heading mb-2">Equipe</h3>
            <div className="card mb-6">
                {academy.teamId ? (
                    <div className="flex-col gap-4">
                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <span className="navi-section-heading" style={{ fontSize: '0.95rem' }}>Membros</span>
                            </div>
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
                                                            className="icon-btn" 
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
                                            onChange={e => setNewMember({...newMember, name: e.target.value})} 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>E-mail</label>
                                        <input 
                                            className="form-input" 
                                            type="email" 
                                            placeholder="recepcao@academia.com" 
                                            value={newMember.email} 
                                            onChange={e => setNewMember({...newMember, email: e.target.value})} 
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Senha Provisória</label>
                                        <input 
                                            className="form-input" 
                                            type="password" 
                                            placeholder="Mínimo 8 caracteres" 
                                            value={newMember.password} 
                                            onChange={e => setNewMember({...newMember, password: e.target.value})} 
                                        />
                                    </div>
                                    {memberError && <p className="field-error">{memberError}</p>}
                                    
                                    <button type="submit" className="btn-secondary mt-1" disabled={savingMember}>
                                        <Plus size={16} /> {savingMember ? 'Criando...' : 'Adicionar Conta'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="navi-subtitle" style={{ marginTop: 0 }}>
                        Nenhum time associado. Faça logout e login novamente para criar/associar automaticamente.
                    </div>
                )}
            </div>

            <h3 className="navi-section-heading mb-2">Dados</h3>
            <p className="navi-subtitle mb-2" style={{ fontSize: '0.85rem' }}>Exportação e exclusão em massa afetam apenas leads e alunos desta base.</p>
            <div className="card flex-col mb-6" style={{ padding: 0, overflow: 'hidden' }}>
                {role === 'owner' ? (
                    <>
                        <div className="action-row">
                            <div className="flex items-center gap-4">
                                <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                    <Download size={18} />
                                </div>
                                <div>
                                    <strong>Exportar todos os dados</strong>
                                    <p className="navi-subtitle" style={{ marginTop: 2 }}>Baixe uma planilha com todos os leads</p>
                                </div>
                            </div>
                            <ExportButton leads={leads} fileName="bjj-crm-completo" label="Baixar" />
                        </div>

                        <div className="action-row" onClick={() => setShowClearConfirm(true)} style={{ cursor: 'pointer' }}>
                            <div className="flex items-center gap-4">
                                <div className="action-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                                    <Trash2 size={18} />
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--danger)' }}>Limpar todos os dados</strong>
                                    <p className="navi-subtitle" style={{ marginTop: 2 }}>Remove todos os leads e alunos</p>
                                </div>
                            </div>
                            <ChevronRight size={18} color="var(--text-muted)" />
                        </div>
                    </>
                ) : (
                    <div style={{ padding: 16 }}>
                        <p className="text-small" style={{ color: 'var(--text-muted)' }}>Apenas o dono da academia pode exportar ou excluir os dados em massa.</p>
                    </div>
                )}
            </div>

            <h3 className="navi-section-heading mb-2">Sistema</h3>
            <div className="card">
                <div className="flex items-center gap-4">
                    <Info size={16} color="var(--text-muted)" />
                    <div>
                        <p className="navi-section-heading" style={{ fontSize: '0.95rem' }}>Nave</p>
                        <p className="text-xs text-light">Dados armazenados na nuvem via Appwrite</p>
                    </div>
                </div>
            </div>

            {/* Clear Confirm Modal */}
            {showClearConfirm && (
                <div className="confirm-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-icon-wrap">
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h3 className="navi-section-heading">Limpar todos os dados?</h3>
                        <p className="navi-subtitle" style={{ marginTop: 10 }}>Esta ação é irreversível. {leads.length} registros (leads e alunos) serão removidos.</p>
                        <p className="navi-subtitle mt-2" style={{ marginTop: 12 }}>Digite <strong>LIMPAR</strong> para confirmar:</p>
                        <input
                            className="form-input mt-2"
                            value={clearConfirmText}
                            onChange={(e) => setClearConfirmText(e.target.value)}
                            placeholder="LIMPAR"
                        />
                        <div className="flex gap-2 mt-4">
                            <button className="btn-outline" style={{ flex: 1 }} onClick={() => { if (clearingAllData) return; setShowClearConfirm(false); setClearConfirmText(''); }} disabled={clearingAllData}>Cancelar</button>
                            <button className="btn-danger" style={{ flex: 1 }} onClick={clearAllData} disabled={clearConfirmText.trim().toUpperCase() !== 'LIMPAR' || clearingAllData}>
                                <Trash2 size={16} /> {clearingAllData ? 'Limpando...' : 'Limpar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default GerenciamentoSection;
