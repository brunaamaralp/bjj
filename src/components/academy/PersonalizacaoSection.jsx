import React, { useState } from 'react';
import { Plus, X, ChevronRight } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, STOCK_ITEMS_COL, INVENTORY_MOVE_FN_ID, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';

const PersonalizacaoSection = ({ academy, setAcademy, onSave, academyId }) => {
    const addToast = useUiStore((s) => s.addToast);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
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
            addToast({ type: 'success', message: 'Perguntas do lead salvas.' });
        } catch (e) { console.error('save questions:', e); }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave();
            setEditing(false);
        } catch (e) {
            // error handled in onSave
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Sistema e Rótulos</h3>
                {!editing && (
                    <button className="edit-link" onClick={() => setEditing(true)}>Editar</button>
                )}
            </div>

            <div className="card mb-6">
                {editing ? (
                    <div className="flex-col gap-4">
                        <div className="form-group">
                            <label>Nome do funil (menu e título da página)</label>
                            <input className="form-input" value={academy.uiLabels?.pipeline ?? 'Funil'}
                                onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, pipeline: e.target.value } })}
                                placeholder="Ex: Funil" />
                            <p className="text-xs text-light">Aparece na navegação e no cabeçalho do board de etapas.</p>
                        </div>
                        <div className="form-group">
                            <label>Rótulo para Leads (plural)</label>
                            <input className="form-input" value={academy.uiLabels?.leads || ''}
                                onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, leads: e.target.value } })}
                                placeholder="Ex: Leads" />
                        </div>
                        <div className="form-group">
                            <label>Rótulo para Alunos (plural)</label>
                            <input className="form-input" value={academy.uiLabels?.students || ''}
                                onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, students: e.target.value } })}
                                placeholder="Ex: Alunos" />
                        </div>
                        <div className="form-group">
                            <label>Rótulo para Aulas (plural)</label>
                            <input className="form-input" value={academy.uiLabels?.classes || ''}
                                onChange={e => setAcademy({ ...academy, uiLabels: { ...academy.uiLabels, classes: e.target.value } })}
                                placeholder="Ex: Aulas" />
                        </div>
                        <div className="form-group">
                            <label>Módulos</label>
                            <div className="flex gap-4">
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!!academy.modules?.sales}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            if (checked && (!STOCK_ITEMS_COL || !SALES_CREATE_FN_ID || !SALES_CANCEL_FN_ID)) {
                                                addToast({
                                                    type: 'error',
                                                    message: 'Para ativar Vendas, configure: VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID, VITE_APPWRITE_SALES_CREATE_FN_ID e VITE_APPWRITE_SALES_CANCEL_FN_ID.',
                                                });
                                                return;
                                            }
                                            setAcademy({ ...academy, modules: { ...academy.modules, sales: checked } });
                                        }}
                                    />
                                    <span className="text-small">Vendas</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        checked={!!academy.modules?.inventory}
                                        onChange={(e) => {
                                            const checked = e.target.checked;
                                            if (checked && (!STOCK_ITEMS_COL || !INVENTORY_MOVE_FN_ID)) {
                                                addToast({
                                                    type: 'error',
                                                    message: 'Para ativar Estoque, configure: VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID e VITE_APPWRITE_INVENTORY_MOVE_FN_ID.',
                                                });
                                                return;
                                            }
                                            setAcademy({ ...academy, modules: { ...academy.modules, inventory: checked } });
                                        }}
                                    />
                                    <span className="text-small">Estoque</span>
                                </label>
                                <label className="flex items-center gap-2">
                                    <input type="checkbox" checked={!!academy.modules?.finance} onChange={(e) => setAcademy({ ...academy, modules: { ...academy.modules, finance: e.target.checked } })} />
                                    <span className="text-small">Financeiro</span>
                                </label>
                            </div>
                            <p className="text-xs text-light">Define módulos ativos apenas para esta academia.</p>
                        </div>
                        <div className="flex gap-2">
                            <button className="btn-outline" style={{ flex: 1 }} onClick={() => setEditing(false)}>Cancelar</button>
                            <button className="btn-secondary" style={{ flex: 2 }} onClick={handleSave} disabled={saving}>
                                {saving ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex-col gap-2">
                        <div className="info-row">
                            <span className="info-row-label" style={{ minWidth: 120 }}>Rótulo Leads</span>
                            <span className="info-row-value">{academy.uiLabels?.leads || 'Não informado'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-row-label" style={{ minWidth: 120 }}>Rótulo Alunos</span>
                            <span className="info-row-value">{academy.uiLabels?.students || 'Não informado'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-row-label" style={{ minWidth: 120 }}>Rótulo Aulas</span>
                            <span className="info-row-value">{academy.uiLabels?.classes || 'Não informado'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-row-label" style={{ minWidth: 120 }}>Nome do Funil</span>
                            <span className="info-row-value">{academy.uiLabels?.pipeline || 'Não informado'}</span>
                        </div>
                        <div className="info-row">
                            <span className="info-row-label" style={{ minWidth: 120 }}>Módulos Ativos</span>
                            <span className="info-row-value">{Object.entries(academy.modules || {}).filter(([, v]) => v).map(([k]) => k).join(', ') || 'Nenhum habilitado'}</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Perguntas do Lead</h3>
            </div>
            <div className="card">
                <div className="flex-col gap-3">
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
                    <div className="flex-col gap-2">
                        {(academy.customLeadQuestions || []).map((q, idx) => (
                            <div key={`${q?.id || q?.label || idx}`} className="info-row">
                                <div className="flex gap-2" style={{ flex: 1 }}>
                                    <input
                                        className="form-input"
                                        value={q?.label || ''}
                                        placeholder="Pergunta"
                                        onChange={(e) => {
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
                                        onChange={(e) => {
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
                                            onChange={(e) => {
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
                            </div>
                        ))}
                        {(academy.customLeadQuestions || []).length === 0 && (
                            <div className="navi-subtitle" style={{ marginTop: 0 }}>
                                Nenhuma pergunta configurada. Adicione perguntas personalizadas para acompanhar no perfil do lead.
                            </div>
                        )}
                    </div>
                    <div className="flex gap-2 mt-2">
                        <button
                            className="btn-secondary"
                            onClick={() => saveQuestions(academy.customLeadQuestions || [])}
                        >
                            Salvar alterações
                        </button>
                    </div>
                    <p className="text-xs text-light">As respostas são preenchidas no card do lead.</p>
                </div>
            </div>
        </section>
    );
};

export default PersonalizacaoSection;
