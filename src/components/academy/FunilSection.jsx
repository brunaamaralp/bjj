import React, { useState, useEffect } from 'react';
import { Plus, X, ChevronRight } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import LabelPill from '../shared/LabelPill';

const PRESET_COLORS = ['#5B3FBF', '#F04040', '#F5A623', '#25D366', '#0088CC', '#8E8E8E'];

const FunilSection = ({ academy, setAcademy, academyId }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [newQuestion, setNewQuestion] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Labels state ──────────────────────────────────────────────────────────
    const [labels, setLabels] = useState([]);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('#5B3FBF');
    const [editingLabel, setEditingLabel] = useState(null); // { $id, name, color }
    const [labelsLoading, setLabelsLoading] = useState(false);

    const createId = () => {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch { void 0; }
        const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
        return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
    };

    const saveQuestions = async (qs) => {
        if (!academyId) return;
        setSaving(true);
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                customLeadQuestions: JSON.stringify(qs)
            });
            setAcademy(a => ({ ...a, customLeadQuestions: qs }));
            addToast({ type: 'success', message: 'Perguntas do lead salvas.' });
        } catch (e) {
            console.error('save questions:', e);
            addToast({ type: 'error', message: 'Não foi possível salvar as perguntas.' });
        } finally {
            setSaving(false);
        }
    };

    const handleAddQuestion = () => {
        const q = (newQuestion || '').trim();
        if (!q) return;
        const newQ = { id: createId(), label: q, type: 'text' };
        setAcademy(a => ({ ...a, customLeadQuestions: [...(a.customLeadQuestions || []), newQ] }));
        setNewQuestion('');
    };

    // ── Labels API helpers ────────────────────────────────────────────────────
    const getJwt = async () => {
        try {
            const jwt = await account.createJWT();
            return String(jwt?.jwt || '').trim();
        } catch { return ''; }
    };

    const labelsHeaders = async () => {
        const jwt = await getJwt();
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': academyId || '',
        };
    };

    const fetchLabels = async () => {
        if (!academyId) return;
        setLabelsLoading(true);
        try {
            const res = await fetch(`/api/labels`, { headers: await labelsHeaders() });
            const data = await res.json();
            if (data?.sucesso) setLabels(data.labels || []);
        } catch { /* silent */ } finally {
            setLabelsLoading(false);
        }
    };

    useEffect(() => { fetchLabels(); }, [academyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCreateLabel = async () => {
        const name = newLabelName.trim();
        if (!name) return;
        try {
            const res = await fetch('/api/labels', {
                method: 'POST',
                headers: await labelsHeaders(),
                body: JSON.stringify({ name, color: newLabelColor }),
            });
            const data = await res.json();
            if (data?.sucesso) {
                setLabels((prev) => [...prev, data.label]);
                setNewLabelName('');
                setNewLabelColor('#5B3FBF');
                addToast({ type: 'success', message: `Etiqueta "${name}" criada.` });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Erro ao criar etiqueta.' });
            }
        } catch {
            addToast({ type: 'error', message: 'Erro de conexão ao criar etiqueta.' });
        }
    };

    const handleSaveEditLabel = async () => {
        if (!editingLabel) return;
        const name = (editingLabel.name || '').trim();
        if (!name) return;
        try {
            const res = await fetch(`/api/labels?id=${editingLabel.$id}`, {
                method: 'PATCH',
                headers: await labelsHeaders(),
                body: JSON.stringify({ name, color: editingLabel.color }),
            });
            const data = await res.json();
            if (data?.sucesso) {
                setLabels((prev) => prev.map((l) => l.$id === editingLabel.$id ? data.label : l));
                setEditingLabel(null);
                addToast({ type: 'success', message: 'Etiqueta atualizada.' });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Erro ao editar etiqueta.' });
            }
        } catch {
            addToast({ type: 'error', message: 'Erro de conexão ao editar etiqueta.' });
        }
    };

    const handleDeleteLabel = async (label) => {
        if (!window.confirm(`Remover etiqueta "${label.name}"? Ela será desvinculada de todos os leads.`)) return;
        try {
            const res = await fetch(`/api/labels?id=${label.$id}`, {
                method: 'DELETE',
                headers: await labelsHeaders(),
            });
            const data = await res.json();
            if (data?.sucesso) {
                setLabels((prev) => prev.filter((l) => l.$id !== label.$id));
                addToast({ type: 'success', message: `Etiqueta "${label.name}" removida.` });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Erro ao remover etiqueta.' });
            }
        } catch {
            addToast({ type: 'error', message: 'Erro de conexão ao remover etiqueta.' });
        }
    };

    const handleRemoveQuestion = (id, idx) => {
        setAcademy(a => ({
            ...a,
            customLeadQuestions: id
                ? (a.customLeadQuestions || []).filter((it) => it?.id !== id)
                : (a.customLeadQuestions || []).filter((_, i) => i !== idx)
        }));
    };

    return (
        <>
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
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddQuestion(); }}
                            />
                            <button className="btn-secondary" onClick={handleAddQuestion}>
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
                                                const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
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
                                            onClick={() => handleRemoveQuestion(q?.id, idx)}
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
                                disabled={saving}
                            >
                                {saving ? 'Salvando...' : 'Salvar alterações'}
                            </button>
                        </div>
                    )}
                    <p className="text-xs text-light">As respostas são preenchidas no card do lead.</p>
                </div>
            </div>
        </section>

        {/* ── Etiquetas ──────────────────────────────────────────────────── */}
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.1s' }}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Etiquetas</h3>
            </div>
            <div className="card">
                <div className="flex-col gap-3">
                    {labelsLoading && (
                        <p className="navi-subtitle" style={{ margin: 0 }}>Carregando...</p>
                    )}

                    {!labelsLoading && labels.length === 0 && (
                        <p className="navi-subtitle" style={{ margin: 0 }}>Nenhuma etiqueta ainda.</p>
                    )}

                    {!labelsLoading && labels.length > 0 && (
                        <div className="flex-col gap-2">
                            {labels.map((label) => (
                                <div key={label.$id} className="info-row" style={{ alignItems: 'center' }}>
                                    {editingLabel?.$id === label.$id ? (
                                        <>
                                            <input
                                                className="form-input"
                                                value={editingLabel.name}
                                                onChange={(e) => setEditingLabel((v) => ({ ...v, name: e.target.value }))}
                                                style={{ flex: 1, minWidth: 100 }}
                                                maxLength={30}
                                            />
                                            <div className="flex gap-1" style={{ flexShrink: 0 }}>
                                                {PRESET_COLORS.map((c) => (
                                                    <button
                                                        key={c}
                                                        type="button"
                                                        onClick={() => setEditingLabel((v) => ({ ...v, color: c }))}
                                                        style={{
                                                            width: 18, height: 18, borderRadius: '50%',
                                                            background: c, border: editingLabel.color === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                                                            cursor: 'pointer', padding: 0, flexShrink: 0,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                            <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: 12 }} onClick={handleSaveEditLabel}>Salvar</button>
                                            <button className="btn-outline" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setEditingLabel(null)}>Cancelar</button>
                                        </>
                                    ) : (
                                        <>
                                            <LabelPill label={label} />
                                            {label.is_system && (
                                                <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '1px 6px', marginLeft: 4 }}>
                                                    Sistema
                                                </span>
                                            )}
                                            {!label.is_system && role === 'owner' && (
                                                <div className="flex gap-1" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                    <button
                                                        className="icon-btn"
                                                        title="Editar"
                                                        onClick={() => setEditingLabel({ $id: label.$id, name: label.name, color: label.color })}
                                                    >
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        title="Remover"
                                                        onClick={() => handleDeleteLabel(label)}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {role === 'owner' && !editingLabel && (
                        <div className="flex flex-wrap gap-2 mt-1" style={{ alignItems: 'center' }}>
                            <input
                                className="form-input"
                                placeholder="Nome da etiqueta"
                                value={newLabelName}
                                onChange={(e) => setNewLabelName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateLabel(); }}
                                maxLength={30}
                                style={{ flex: '1 1 140px', minWidth: 120 }}
                            />
                            <div className="flex gap-1" style={{ flexShrink: 0 }}>
                                {PRESET_COLORS.map((c) => (
                                    <button
                                        key={c}
                                        type="button"
                                        onClick={() => setNewLabelColor(c)}
                                        style={{
                                            width: 20, height: 20, borderRadius: '50%',
                                            background: c, border: newLabelColor === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                                            cursor: 'pointer', padding: 0, flexShrink: 0,
                                        }}
                                    />
                                ))}
                            </div>
                            <button
                                className="btn-secondary"
                                onClick={handleCreateLabel}
                                disabled={!newLabelName.trim()}
                                style={{ flexShrink: 0 }}
                            >
                                <Plus size={14} /> Adicionar
                            </button>
                        </div>
                    )}

                    <p className="text-xs text-light">Etiquetas do sistema não podem ser editadas. Etiquetas customizadas podem ser criadas e removidas pelo proprietário.</p>
                </div>
            </div>
        </section>
        </>
    );
};

export default FunilSection;
