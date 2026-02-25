import React, { useState, useEffect } from 'react';
import { useLeadStore, LEAD_STATUS } from '../store/useLeadStore';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { Building2, Phone, Mail, MapPin, Trash2, Download, ChevronRight, LogOut, Info } from 'lucide-react';
import ExportButton from '../components/ExportButton';

const Account = ({ user, onLogout }) => {
    const { leads } = useLeadStore();
    const academyId = useLeadStore((s) => s.academyId);

    const [academy, setAcademy] = useState({ name: '', phone: '', email: '', address: '' });
    const [editing, setEditing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [saving, setSaving] = useState(false);

    // Fetch academy data from Appwrite
    useEffect(() => {
        if (!academyId) return;
        databases.getDocument(DB_ID, ACADEMIES_COL, academyId)
            .then(doc => setAcademy({
                name: doc.name || '',
                phone: doc.phone || '',
                email: doc.email || '',
                address: doc.address || '',
            }))
            .catch(e => console.error('fetch academy:', e));
    }, [academyId]);

    const totalLeads = leads.length;
    const students = leads.filter(l => l.status === LEAD_STATUS.CONVERTED).length;
    const scheduled = leads.filter(l => l.status === LEAD_STATUS.SCHEDULED).length;

    const saveAcademy = async () => {
        if (!academyId) return;
        setSaving(true);
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                name: academy.name,
                phone: academy.phone,
                email: academy.email,
                address: academy.address,
            });
            setEditing(false);
        } catch (e) {
            console.error('save academy:', e);
        } finally {
            setSaving(false);
        }
    };

    const clearAllData = async () => {
        for (const lead of leads) {
            await useLeadStore.getState().deleteLead(lead.id);
        }
        setShowClearConfirm(false);
    };

    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <h2>Minha Conta</h2>
                <p className="text-small">Configurações da academia e do sistema</p>
            </div>

            {/* Academy Avatar */}
            <div className="account-hero card mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
                <div className="flex items-center gap-4">
                    <div className="account-avatar">
                        <Building2 size={28} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <h3 style={{ fontSize: '1.15rem' }}>{academy.name || 'Minha Academia'}</h3>
                        <p className="text-small">{user?.email || 'Configure seus dados abaixo'}</p>
                    </div>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="stats-grid mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
                <div className="stat-card">
                    <span className="stat-number">{totalLeads}</span>
                    <span className="stat-label">Leads</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{scheduled}</span>
                    <span className="stat-label">Agendados</span>
                </div>
                <div className="stat-card">
                    <span className="stat-number">{students}</span>
                    <span className="stat-label">Alunos</span>
                </div>
            </div>

            {/* Academy Info */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.15s' }}>
                <div className="flex justify-between items-center mb-2">
                    <h3>Dados da Academia</h3>
                    {!editing && (
                        <button className="edit-link" onClick={() => setEditing(true)}>Editar</button>
                    )}
                </div>

                <div className="card">
                    {editing ? (
                        <div className="flex-col gap-4">
                            <div className="form-group">
                                <label>Nome da Academia</label>
                                <input className="form-input" value={academy.name}
                                    onChange={e => setAcademy({ ...academy, name: e.target.value })}
                                    placeholder="Ex: Team BJJ" />
                            </div>
                            <div className="form-group">
                                <label>Telefone</label>
                                <input className="form-input" value={academy.phone}
                                    onChange={e => setAcademy({ ...academy, phone: e.target.value })}
                                    placeholder="(00) 00000-0000" />
                            </div>
                            <div className="form-group">
                                <label>E-mail</label>
                                <input className="form-input" type="email" value={academy.email}
                                    onChange={e => setAcademy({ ...academy, email: e.target.value })}
                                    placeholder="contato@academia.com" />
                            </div>
                            <div className="form-group">
                                <label>Endereço</label>
                                <input className="form-input" value={academy.address}
                                    onChange={e => setAcademy({ ...academy, address: e.target.value })}
                                    placeholder="Rua, número, bairro" />
                            </div>
                            <div className="flex gap-2">
                                <button className="btn-outline" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>
                                <button className="btn-secondary" style={{ flex: 2 }} onClick={saveAcademy} disabled={saving}>
                                    {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex-col gap-2">
                            <InfoRow icon={<Building2 size={16} />} label="Nome" value={academy.name} />
                            <InfoRow icon={<Phone size={16} />} label="Telefone" value={academy.phone} />
                            <InfoRow icon={<Mail size={16} />} label="E-mail" value={academy.email} />
                            <InfoRow icon={<MapPin size={16} />} label="Endereço" value={academy.address} />
                        </div>
                    )}
                </div>
            </section>

            {/* Actions */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.2s' }}>
                <h3 className="mb-2">Ações</h3>
                <div className="card flex-col" style={{ padding: 0, overflow: 'hidden' }}>
                    <div className="action-row">
                        <div className="flex items-center gap-4">
                            <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                                <Download size={18} />
                            </div>
                            <div>
                                <strong>Exportar Todos os Dados</strong>
                                <p className="text-small">Baixe uma planilha com todos os leads</p>
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
                                <strong style={{ color: 'var(--danger)' }}>Limpar Todos os Dados</strong>
                                <p className="text-small">Remove todos os leads e alunos</p>
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>

                    <div className="action-row" onClick={onLogout} style={{ cursor: 'pointer' }}>
                        <div className="flex items-center gap-4">
                            <div className="action-icon" style={{ background: '#f1f5f9', color: '#64748b' }}>
                                <LogOut size={18} />
                            </div>
                            <div>
                                <strong>Sair da Conta</strong>
                                <p className="text-small">{user?.email}</p>
                            </div>
                        </div>
                        <ChevronRight size={18} color="var(--text-muted)" />
                    </div>
                </div>
            </section>

            {/* System Info */}
            <section className="mt-6 animate-in" style={{ animationDelay: '0.25s' }}>
                <h3 className="mb-2">Sistema</h3>
                <div className="card">
                    <div className="flex items-center gap-4">
                        <Info size={16} color="var(--text-muted)" />
                        <div>
                            <p className="text-small" style={{ color: 'var(--text)' }}>BJJ CRM v2.0</p>
                            <p className="text-xs text-light">Dados armazenados na nuvem via Appwrite</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* Clear Confirm Modal */}
            {showClearConfirm && (
                <div className="confirm-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-icon-wrap">
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h3>Limpar todos os dados?</h3>
                        <p className="text-small">Esta ação é irreversível. Todos os leads e alunos serão removidos.</p>
                        <div className="flex gap-2 mt-4">
                            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setShowClearConfirm(false)}>Cancelar</button>
                            <button className="btn-danger" style={{ flex: 1 }} onClick={clearAllData}>
                                <Trash2 size={16} /> Limpar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style dangerouslySetInnerHTML={{
                __html: `
        .account-hero { border-top: 4px solid var(--accent); }
        .account-avatar {
          width: 56px; height: 56px; border-radius: 16px;
          background: var(--accent-light); color: var(--accent);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .stats-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .stat-card {
          background: var(--surface); border-radius: var(--radius);
          padding: 16px 12px; text-align: center;
          box-shadow: var(--shadow-sm); border: 1px solid var(--border-light);
          display: flex; flex-direction: column; gap: 2px;
        }
        .stat-number { font-size: 1.5rem; font-weight: 800; color: var(--text); }
        .stat-label { font-size: 0.7rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
        .edit-link {
          background: none; color: var(--accent); font-size: 0.85rem;
          font-weight: 600; padding: 4px 0; min-height: auto;
        }
        .info-row {
          display: flex; align-items: center; gap: 12px;
          padding: 10px 0; border-bottom: 1px solid var(--border-light);
        }
        .info-row:last-child { border-bottom: none; }
        .info-row-icon { color: var(--text-muted); flex-shrink: 0; }
        .info-row-label { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; min-width: 70px; }
        .info-row-value { font-size: 0.9rem; color: var(--text); font-weight: 500; }
        .info-row-empty { font-size: 0.85rem; color: var(--text-muted); font-style: italic; }
        .action-row {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px; border-bottom: 1px solid var(--border-light);
          transition: var(--transition);
        }
        .action-row:last-child { border-bottom: none; }
        .action-row:hover { background: var(--surface-hover); }
        .action-icon {
          width: 40px; height: 40px; border-radius: var(--radius-sm);
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }
        .btn-danger {
          background: var(--danger); color: white;
          border-radius: var(--radius-sm); font-weight: 700;
        }
        .confirm-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.5);
          backdrop-filter: blur(4px); z-index: 200;
          display: flex; align-items: center; justify-content: center;
          padding: 20px; animation: fadeIn 0.2s ease;
        }
        .confirm-modal {
          background: var(--surface); border-radius: var(--radius);
          padding: 24px; width: 100%; max-width: 360px; text-align: center;
          animation: fadeInUp 0.3s ease;
        }
        .confirm-icon-wrap {
          width: 56px; height: 56px; border-radius: 50%;
          background: var(--danger-light); margin: 0 auto 16px;
          display: flex; align-items: center; justify-content: center;
        }
      `}} />
        </div>
    );
};

const InfoRow = ({ icon, label, value }) => (
    <div className="info-row">
        <span className="info-row-icon">{icon}</span>
        <span className="info-row-label">{label}</span>
        {value ? (
            <span className="info-row-value">{value}</span>
        ) : (
            <span className="info-row-empty">Não informado</span>
        )}
    </div>
);

export default Account;
