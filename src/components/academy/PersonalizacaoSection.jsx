import React, { useState } from 'react';
import { Plus, X, ChevronRight } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useLeadStore } from '../../store/useLeadStore';
import { useUserRole } from '../../lib/useUserRole';

const PersonalizacaoSection = ({ academy, setAcademy, academyId }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [newQuestion, setNewQuestion] = useState('');

    const createId = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch { void 0; }
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    const saveQuestions = async (qs) => {
        if (!academyId) return;
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                customLeadQuestions: JSON.stringify(qs)
            });
            setAcademy(a => ({ ...a, customLeadQuestions: qs }));
            try {
                await useLeadStore.getState().completeOnboardingStepIds(['ui_labels']);
            } catch (e) { void e; }
            addToast({ type: 'success', message: 'Perguntas do lead salvas.' });
        } catch (e) { console.error('save questions:', e); }
    };

    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Perguntas do Lead</h3>
            </div>
            <div className="card">
                <div className="flex-col gap-3">
                    {role === 'owner' && (
                        <div className="flex gap-2">
                            <input
                                className="form-input"
                                placeholder="Ex: Qual é seu objetivo principal?"
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                            />
                            <button
                                className="btn-secondary"
                                onClick={() => {
                                    const q = (newQuestion || '').trim();
                                    if (!q) return;
                                    const qs = [...(academy.customLeadQuestions || []), { id: createId(), label: q, type: 'text' }];
                                    setNewQuestion('');
                                    saveQuestions(qs);
                                }}
                            >
                                <Plus size={16} /> Adicionar
                            </button>
                        </div>
                    )}
                    <div className="flex-col gap-2">
                        {(academy.customLeadQuestions || []).map((q, idx) => (
                            <div key={`${q?.id || q?.label || idx}`} className="info-row">
                                <div className="flex gap-2" style={{ flex: 1 }}>
                                    <input
                                        className="form-input"
                                        value={q?.label || ''}
                                        placeholder="Pergunta"
                                        readOnly={role !== 'owner'}
                                        onChange={(e) => {
                                            if (role !== 'owner') return;
                                            const value = e.target.value;
                                            const id = q?.id;
                                            setAcademy((a) => ({
                                                ...a,
                                                customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                    if (id && it?.id === id) return { ...it, label: value };
                                                    if (!id && i === idx) return { ...it, label: value };
                                                    return it;
                                                }),
                                            }));
                                        }}
                                        style={{ flex: 1 }}
                                    />
                                    <select
                                        className="form-input"
                                        value={q?.type || 'text'}
                                        disabled={role !== 'owner'}
                                        onChange={(e) => {
                                            if (role !== 'owner') return;
                                            const value = e.target.value;
                                            const id = q?.id;
                                            setAcademy((a) => ({
                                                ...a,
                                                customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                    if (id && it?.id === id) return { ...it, type: value };
                                                    if (!id && i === idx) return { ...it, type: value };
                                                    return it;
                                                }),
                                            }));
                                        }}
                                        style={{ maxWidth: 140 }}
                                    >
                                        <option value="text">Texto</option>
                                        <option value="number">Número</option>
                                        <option value="boolean">Sim/Não</option>
                                        <option value="select">Lista</option>
                                    </select>
                                    {(q?.type === 'select') && (
                                        <input
                                            className="form-input"
                                            value={Array.isArray(q?.options) ? q.options.join(', ') : (q?.options || '')}
                                            placeholder="Opções (separadas por vírgula)"
                                            readOnly={role !== 'owner'}
                                            onChange={(e) => {
                                                if (role !== 'owner') return;
                                                const raw = e.target.value;
                                                const arr = raw.split(',').map(s => s.trim()).filter(Boolean);
                                                const id = q?.id;
                                                setAcademy((a) => ({
                                                    ...a,
                                                    customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                                                        if (id && it?.id === id) return { ...it, options: arr };
                                                        if (!id && i === idx) return { ...it, options: arr };
                                                        return it;
                                                    }),
                                                }));
                                            }}
                                            style={{ flex: 1 }}
                                        />
                                    )}
                                </div>
                                {role === 'owner' && (
                                    <>
                                        <button
                                            className="icon-btn"
                                            title="Remover"
                                            onClick={() => {
                                                const id = q?.id;
                                                const qs = id
                                                    ? (academy.customLeadQuestions || []).filter((it) => it?.id !== id)
                                                    : (academy.customLeadQuestions || []).filter((_, i) => i !== idx);
                                                saveQuestions(qs);
                                            }}
                                        >
                                            <X size={14} />
                                        </button>
                                        <div className="flex gap-2">
                                            <button
                                                className="icon-btn"
                                                title="Mover para cima"
                                                onClick={() => {
                                                    if (idx <= 0) return;
                                                    const list = [...(academy.customLeadQuestions || [])];
                                                    const [item] = list.splice(idx, 1);
                                                    list.splice(idx - 1, 0, item);
                                                    setAcademy((a) => ({ ...a, customLeadQuestions: list }));
                                                }}
                                            >
                                                <ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} />
                                            </button>
                                            <button
                                                className="icon-btn"
                                                title="Mover para baixo"
                                                onClick={() => {
                                                    const list = [...(academy.customLeadQuestions || [])];
                                                    if (idx >= list.length - 1) return;
                                                    const [item] = list.splice(idx, 1);
                                                    list.splice(idx + 1, 0, item);
                                                    setAcademy((a) => ({ ...a, customLeadQuestions: list }));
                                                }}
                                            >
                                                <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        ))}
                        {(academy.customLeadQuestions || []).length === 0 && (
                            <div className="navi-subtitle" style={{ marginTop: 0 }}>
                                Nenhuma pergunta configurada. {role === 'owner' && 'Adicione perguntas personalizadas para acompanhar no perfil do lead.'}
                            </div>
                        )}
                    </div>
                    {role === 'owner' && (
                        <div className="flex gap-2 mt-2">
                            <button
                                className="btn-secondary"
                                onClick={() => saveQuestions(academy.customLeadQuestions || [])}
                            >
                                Salvar alterações
                            </button>
                        </div>
                    )}
                    <p className="text-xs text-light">As respostas são preenchidas no card do lead.</p>
                </div>
            </div>
        </section>
    );
};

export default PersonalizacaoSection;
