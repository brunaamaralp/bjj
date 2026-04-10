import React from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Sparkles, LayoutTemplate, ChevronRight } from 'lucide-react';

const AtendimentoSection = ({ academy }) => {
    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <h3 className="navi-section-heading mb-2">Integrações</h3>
            <div className="flex-col gap-3">
                <Link
                    to="/inbox?tab=dispositivo"
                    className="card action-row"
                    style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                >
                    <div className="flex items-center gap-4">
                        <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                            <MessageCircle size={18} />
                        </div>
                        <div>
                            <strong>WhatsApp</strong>
                            <p className="navi-subtitle" style={{ marginTop: 2 }}>Conectar aparelho, QR Code e status em Atendimento</p>
                        </div>
                    </div>
                    <ChevronRight size={18} color="var(--text-muted)" />
                </Link>
            </div>

            <h3 className="navi-section-heading mt-6 mb-2">Agente de IA</h3>
            <Link
                to="/inbox?tab=agente"
                className="card action-row"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
                <div className="flex items-center gap-4">
                    <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                        <Sparkles size={18} />
                    </div>
                    <div>
                        <strong>Configurar assistente</strong>
                        <p className="navi-subtitle" style={{ marginTop: 2 }}>Personalidade, horários, planos e regras do atendimento automático</p>
                    </div>
                </div>
                <ChevronRight size={18} color="var(--text-muted)" />
            </Link>
            <p className="text-xs text-light mt-2">A edição completa fica na aba Agente em Atendimento; use o atalho acima.</p>

            <h3 className="navi-section-heading mt-6 mb-2">Templates</h3>
            <Link to="/templates" className="card action-row" style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="flex items-center gap-4">
                    <div className="action-icon" style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                        <LayoutTemplate size={18} />
                    </div>
                    <div>
                        <strong>Mensagens e modelos</strong>
                        <p className="navi-subtitle" style={{ marginTop: 2 }}>Editar textos rápidos para WhatsApp e follow-up</p>
                    </div>
                </div>
                <ChevronRight size={18} color="var(--text-muted)" />
            </Link>
        </section>
    );
};

export default AtendimentoSection;
