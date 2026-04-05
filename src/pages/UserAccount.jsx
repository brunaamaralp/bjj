import React from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut, Building2, ChevronRight, Info } from 'lucide-react';

const UserAccount = ({ user, onLogout }) => {
    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="animate-in">
                <h2 className="navi-page-title">Conta</h2>
                <p className="navi-eyebrow" style={{ marginTop: 6 }}>Seu perfil e acesso ao app</p>
            </div>

            <div className="account-hero card mt-4 animate-in" style={{ animationDelay: '0.05s', borderTop: '4px solid var(--accent)' }}>
                <div className="flex items-center gap-4">
                    <div
                        className="account-avatar"
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 16,
                            background: 'var(--accent-light)',
                            color: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >
                        <User size={28} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <h3 className="navi-section-heading" style={{ fontSize: '1.05rem' }}>Sessão atual</h3>
                        <p className="navi-subtitle" style={{ marginTop: 4, wordBreak: 'break-all' }}>{user?.email || '—'}</p>
                    </div>
                </div>
            </div>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.1s' }}>
                <h3 className="navi-section-heading mb-2">Academia</h3>
                <Link
                    to="/empresa"
                    className="card"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            className="action-icon"
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: 'var(--accent-light)',
                                color: 'var(--accent)',
                            }}
                        >
                            <Building2 size={18} />
                        </div>
                        <div>
                            <strong>Configurações da empresa</strong>
                            <p className="navi-subtitle" style={{ marginTop: 2 }}>Checklist, contato, funil, equipe e dados</p>
                        </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </Link>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.12s' }}>
                <h3 className="navi-section-heading mb-2">Sair</h3>
                <button
                    type="button"
                    className="card"
                    onClick={onLogout}
                    style={{
                        width: '100%',
                        textAlign: 'left',
                        border: '1px solid var(--border-light)',
                        background: 'var(--surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                        borderRadius: 'var(--radius)',
                    }}
                >
                    <div className="flex items-center gap-4">
                        <div
                            style={{
                                width: 40,
                                height: 40,
                                borderRadius: 'var(--radius-sm)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                background: '#f1f5f9',
                                color: '#64748b',
                            }}
                        >
                            <LogOut size={18} />
                        </div>
                        <div>
                            <strong>Encerrar sessão</strong>
                            <p className="navi-subtitle" style={{ marginTop: 2 }}>Desconectar deste dispositivo</p>
                        </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </button>
            </section>

            <section className="mt-6 animate-in" style={{ animationDelay: '0.15s' }}>
                <h3 className="navi-section-heading mb-2">Sobre</h3>
                <div className="card">
                    <div className="flex items-center gap-4">
                        <Info size={16} color="var(--text-muted)" />
                        <p className="text-xs text-light" style={{ margin: 0 }}>
                            Nave — dados na nuvem via Appwrite. Use <strong>Empresa</strong> para exportar ou limpar leads; sair da conta fica aqui.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default UserAccount;
