import React, { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import ExportButton from '../ExportButton';

const AvancadoSection = ({ academy, leads }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);

    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearConfirmText, setClearConfirmText] = useState('');
    const [clearingAllData, setClearingAllData] = useState(false);

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
                    </>
                ) : (
                    <div style={{ padding: 16 }}>
                        <p className="text-small" style={{ color: 'var(--text-muted)' }}>Apenas o dono da academia pode exportar ou excluir os dados em massa.</p>
                    </div>
                )}
            </div>

            {role === 'owner' && (
                <>
                    <div
                        style={{
                            border: '1.5px solid #F04040',
                            borderRadius: 12,
                            padding: '16px 20px',
                            background: 'rgba(240,64,64,0.04)'
                        }}
                    >
                        <h3 className="navi-section-heading mb-2" style={{ color: '#F04040' }}>Zona de perigo</h3>
                        <p className="navi-subtitle mb-2" style={{ fontSize: '0.85rem' }}>
                            Ações irreversíveis. Prossiga com cuidado.
                        </p>
                        <div
                            className="action-row"
                            onClick={() => setShowClearConfirm(true)}
                            style={{ cursor: 'pointer', borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border-light)' }}
                        >
                            <div className="flex items-center gap-4">
                                <div className="action-icon" style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}>
                                    <Trash2 size={18} />
                                </div>
                                <div>
                                    <strong style={{ color: 'var(--danger)' }}>Limpar todos os dados</strong>
                                    <p className="navi-subtitle" style={{ marginTop: 2 }}>Remove todos os leads e alunos</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {showClearConfirm && (
                <div className="confirm-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-icon-wrap">
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h3 className="navi-section-heading">Limpar todos os dados?</h3>
                        <p className="navi-subtitle" style={{ marginTop: 10 }}>
                            Esta ação é irreversível. {leads.length} registros (leads e alunos) serão removidos.
                        </p>
                        <p className="navi-subtitle mt-2" style={{ marginTop: 12 }}>
                            Digite <strong>LIMPAR</strong> para confirmar:
                        </p>
                        <input
                            className="form-input mt-2"
                            value={clearConfirmText}
                            onChange={(e) => setClearConfirmText(e.target.value)}
                            placeholder="LIMPAR"
                        />
                        <div className="flex gap-2 mt-4">
                            <button
                                className="btn-outline"
                                style={{ flex: 1 }}
                                onClick={() => { if (clearingAllData) return; setShowClearConfirm(false); setClearConfirmText(''); }}
                                disabled={clearingAllData}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-danger"
                                style={{ flex: 1 }}
                                onClick={clearAllData}
                                disabled={clearConfirmText.trim().toUpperCase() !== 'LIMPAR' || clearingAllData}
                            >
                                <Trash2 size={16} /> {clearingAllData ? 'Limpando...' : 'Limpar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
};

export default AvancadoSection;
