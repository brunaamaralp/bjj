import '../../styles/confirm-inline.css';
import React, { useState } from 'react';
import { Download, Trash2, ShieldAlert } from 'lucide-react';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { useTerms } from '../../lib/terminology.js';
import { exportAllLeadsSpreadsheet } from '../../lib/exportLeadsSpreadsheet.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import ContractsAutentiqueSection from './ContractsAutentiqueSection.jsx';

const AvancadoSection = ({ academy, leads, showAutentique = true }) => {
    const terms = useTerms();
    const addToast = useUiStore((s) => s.addToast);
    const storeAcademyId = useLeadStore((s) => s.academyId);
    const role = useUserRole(academy);
    const academyId = academy?.id || storeAcademyId;

    const [showExportConfirm, setShowExportConfirm] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearConfirmText, setClearConfirmText] = useState('');
    const [clearingAllData, setClearingAllData] = useState(false);

    const scopeLabel = 'leads e alunos';

    const runExport = async () => {
        if (!academyId) {
            addToast({ type: 'warning', message: 'Selecione uma academia para exportar.' });
            return;
        }
        setExporting(true);
        try {
            const { ok, count } = await exportAllLeadsSpreadsheet(academyId, 'bjj-crm-completo', {
                includeContact: true,
                onProgress: (n, total) => {
                    if (total && n < total) {
                        addToast({ type: 'info', message: `Exportando… ${n} de ${total}` });
                    }
                },
            });
            if (!ok || count === 0) {
                addToast({ type: 'warning', message: 'Não há dados para exportar.' });
                return;
            }
            addToast({ type: 'success', message: `Planilha gerada com ${count} registro(s).` });
            setShowExportConfirm(false);
        } catch (e) {
            console.error('[Avancado] export:', e);
            addToast({ type: 'error', message: 'Não foi possível exportar os dados.' });
        } finally {
            setExporting(false);
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
        <>
            <section
                id="avancado-exportar"
                className="empresa-section mt-4 animate-in"
                style={{ animationDelay: '0.05s', scrollMarginTop: 56 }}
            >
                <h3 className="navi-section-heading mb-2">Exportar dados</h3>
                <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
                    Baixe ou remova em massa os registros desta {terms.workspaceNoun}. O escopo inclui{' '}
                    {scopeLabel}.
                </p>
                <div className="card flex-col" style={{ padding: 0, overflow: 'hidden' }}>
                    {role === 'owner' ? (
                        <div className="action-row">
                            <div className="flex items-center gap-4">
                                <div
                                    className="action-icon"
                                    style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                                >
                                    <Download size={18} />
                                </div>
                                <div>
                                    <strong>Exportar todos os dados ({scopeLabel})</strong>
                                    <p className="navi-subtitle" style={{ marginTop: 2 }}>
                                        Gera uma planilha com todos os contatos da base
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="export-btn"
                                disabled={exporting || !academyId}
                                onClick={() => setShowExportConfirm(true)}
                                style={{
                                    background: 'var(--surface)',
                                    border: '1.5px solid var(--border)',
                                    color: 'var(--text-secondary)',
                                    padding: '0 14px',
                                    minHeight: 38,
                                    borderRadius: 'var(--radius-sm)',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <Download size={16} /> Baixar
                            </button>
                        </div>
                    ) : (
                        <div style={{ padding: 16 }}>
                            <p className="text-small" style={{ color: 'var(--text-muted)' }}>
                                Apenas o titular da {terms.workspaceNoun} pode exportar ou excluir os dados em massa.
                            </p>
                        </div>
                    )}
                </div>
            </section>

            {role === 'owner' && (
                <>
                    <div className="funil-section-divider" role="separator" aria-hidden="true" />

                    <section
                        id="avancado-perigo"
                        className="empresa-section animate-in"
                        style={{ animationDelay: '0.08s', scrollMarginTop: 56 }}
                    >
                        <h3 className="navi-section-heading mb-2" style={{ color: '#F04040', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert size={18} aria-hidden />
                            Zona de perigo
                        </h3>
                        <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
                            Ações irreversíveis sobre {scopeLabel}. Prossiga com cuidado.
                        </p>
                        <div
                            style={{
                                border: '1.5px solid #F04040',
                                borderRadius: 12,
                                padding: '16px 20px',
                                background: 'rgba(240,64,64,0.04)',
                            }}
                        >
                            <div
                                className="action-row"
                                onClick={() => setShowClearConfirm(true)}
                                style={{
                                    cursor: 'pointer',
                                    borderRadius: 8,
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border-light)',
                                    margin: 0,
                                }}
                            >
                                <div className="flex items-center gap-4">
                                    <div
                                        className="action-icon"
                                        style={{ background: 'var(--danger-light)', color: 'var(--danger)' }}
                                    >
                                        <Trash2 size={18} />
                                    </div>
                                    <div>
                                        <strong style={{ color: 'var(--danger)' }}>
                                            Limpar todos os dados ({scopeLabel})
                                        </strong>
                                        <p className="navi-subtitle" style={{ marginTop: 2 }}>
                                            Remove permanentemente todos os registros da base
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {showAutentique ? (
                        <>
                            <div className="funil-section-divider" role="separator" aria-hidden="true" />

                            <section
                                id="avancado-integracoes"
                                className="empresa-section animate-in"
                                style={{ animationDelay: '0.1s', scrollMarginTop: 56 }}
                            >
                                <h3 className="navi-section-heading mb-2">Integrações avançadas</h3>
                                <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
                                    Serviços opcionais que exigem configuração fora do Nave.
                                </p>
                                <ContractsAutentiqueSection />
                            </section>
                        </>
                    ) : null}
                </>
            )}

            <ConfirmDialog
                open={showExportConfirm}
                title="Exportar todos os dados?"
                description="Você receberá um arquivo com todos os dados (leads e alunos) desta base. Deseja continuar?"
                confirmLabel="Confirmar"
                cancelLabel="Cancelar"
                confirmVariant="secondary"
                loading={exporting}
                onConfirm={() => void runExport()}
                onClose={() => {
                    if (!exporting) setShowExportConfirm(false);
                }}
            />

            {showClearConfirm && (
                <div className="confirm-overlay">
                    <div className="confirm-modal">
                        <div className="confirm-icon-wrap">
                            <Trash2 size={28} color="var(--danger)" />
                        </div>
                        <h3 className="navi-section-heading">Limpar todos os dados?</h3>
                        <p className="navi-subtitle" style={{ marginTop: 10 }}>
                            Esta ação é irreversível. {leads.length} registros ({scopeLabel}) serão removidos.
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
                                onClick={() => {
                                    if (clearingAllData) return;
                                    setShowClearConfirm(false);
                                    setClearConfirmText('');
                                }}
                                disabled={clearingAllData}
                            >
                                Cancelar
                            </button>
                            <button
                                className="btn-danger"
                                style={{ flex: 1 }}
                                onClick={() => void clearAllData()}
                                disabled={clearConfirmText.trim().toUpperCase() !== 'LIMPAR' || clearingAllData}
                            >
                                <Trash2 size={16} /> {clearingAllData ? 'Limpando...' : 'Limpar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default AvancadoSection;
