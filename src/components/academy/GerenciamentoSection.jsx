import React, { useState, useEffect } from 'react';
import { Download, Trash2, ChevronRight, Info } from 'lucide-react';
import { teams } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import ExportButton from '../ExportButton';

const GerenciamentoSection = ({ academy, leads }) => {
    const addToast = useUiStore((s) => s.addToast);
    
    // Team states
    const [memberships, setMemberships] = useState([]);
    const [memberEmail, setMemberEmail] = useState('');
    const [memberRole, setMemberRole] = useState('viewer');
    const [inviting, setInviting] = useState(false);

    // Clear data states
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearConfirmText, setClearConfirmText] = useState('');
    const [clearingAllData, setClearingAllData] = useState(false);

    useEffect(() => {
        if (!academy.teamId) {
            setMemberships([]);
            return;
        }
        teams.listMemberships(academy.teamId)
            .then(res => setMemberships(res.memberships || []))
            .catch(() => setMemberships([]));
    }, [academy.teamId]);

    const inviteMember = async () => {
        if (!academy.teamId || !memberEmail) return;
        setInviting(true);
        try {
            await teams.createMembership(academy.teamId, memberEmail, [memberRole], `${window.location.origin}/`);
            setMemberEmail('');
            try {
                const res = await teams.listMemberships(academy.teamId);
                setMemberships(res.memberships || []);
            } catch (e) { void e; }
            addToast({ type: 'success', message: 'Convite enviado por e-mail.' });
        } catch (e) {
            console.error('invite member:', e);
            addToast({ type: 'error', message: 'Não foi possível enviar o convite. Verifique o SMTP no Appwrite.' });
        } finally {
            setInviting(false);
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
                    <div className="flex-col gap-3">
                        <div className="info-row">
                            <span className="info-row-label">Team ID</span>
                            <span className="info-row-value">{academy.teamId}</span>
                        </div>
                        <div className="form-group">
                            <label>Convidar por e-mail</label>
                            <div className="flex gap-2">
                                <input className="form-input" type="email" placeholder="email@exemplo.com" value={memberEmail} onChange={e => setMemberEmail(e.target.value)} />
                                <select className="form-input" value={memberRole} onChange={e => setMemberRole(e.target.value)}>
                                    <option value="viewer">viewer</option>
                                    <option value="editor">editor</option>
                                    <option value="owner">owner</option>
                                </select>
                                <button className="btn-secondary" onClick={inviteMember} disabled={inviting || !memberEmail}>Convidar</button>
                            </div>
                            <p className="text-xs text-light">É necessário SMTP configurado no Appwrite para envio do convite.</p>
                        </div>
                        <div>
                            <span className="navi-section-heading" style={{ fontSize: '0.95rem', display: 'block', marginBottom: 4 }}>Membros</span>
                            <div className="flex-col gap-1 mt-2">
                                {(memberships || []).map(m => (
                                    <div key={m.$id} className="info-row">
                                        <span className="info-row-label">{m.userName || m.userId}</span>
                                        <span className="info-row-value">{(m.roles || []).join(', ')}</span>
                                    </div>
                                ))}
                                {(memberships || []).length === 0 && (
                                    <div className="navi-subtitle" style={{ marginTop: 0 }}>Nenhum membro listado.</div>
                                )}
                            </div>
                        </div>
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
