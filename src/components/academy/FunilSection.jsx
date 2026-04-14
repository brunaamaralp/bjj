import React, { useState, useEffect, useRef } from 'react';
import { Plus, X, ChevronRight, Tag, Pencil } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import LabelPill from '../shared/LabelPill';

const PRESET_COLORS = ['#5B3FBF', '#F04040', '#F5A623', '#25D366', '#0088CC', '#8E8E8E'];

function LabelColorSwatch({ color, selected, onSelect }) {
    return (
        <button
            type="button"
            aria-label={`Selecionar cor ${color}`}
            aria-pressed={selected}
            onClick={() => onSelect(color)}
            style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                padding: 0,
                cursor: 'pointer',
                flexShrink: 0,
                background: color,
                border: 'none',
                boxSizing: 'border-box',
                ...(selected
                    ? { boxShadow: `0 0 0 2px var(--surface), 0 0 0 4px ${color}` }
                    : { boxShadow: '0 0 0 1px var(--border)' }),
            }}
        />
    );
}

const FunilSection = ({ academy, setAcademy, academyId }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [newQuestion, setNewQuestion] = useState('');
    const [saving, setSaving] = useState(false);

    // ── Labels state ──────────────────────────────────────────────────────────
    const [labels, setLabels] = useState([]);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('');
    const [editingLabel, setEditingLabel] = useState(null); // { $id, name, color }
    const [labelsLoading, setLabelsLoading] = useState(false);
    const [lastCreatedId, setLastCreatedId] = useState(null);
    const [exitingIds, setExitingIds] = useState({});
    const enterClearRef = useRef(null);

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
        const color = String(newLabelColor || '').trim();
        if (!name || !color) return;
        try {
            const res = await fetch('/api/labels', {
                method: 'POST',
                headers: await labelsHeaders(),
                body: JSON.stringify({ name, color }),
            });
            const data = await res.json();
            if (data?.sucesso) {
                setLabels((prev) => [...prev, data.label].sort((a, b) =>
                    String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
                ));
                setNewLabelName('');
                setNewLabelColor('');
                setLastCreatedId(data.label.$id);
                if (enterClearRef.current) window.clearTimeout(enterClearRef.current);
                enterClearRef.current = window.setTimeout(() => setLastCreatedId(null), 450);
                addToast({ type: 'success', message: 'Etiqueta criada' });
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
        const color = String(editingLabel.color || '').trim();
        if (!name || !color) return;
        try {
            const res = await fetch(`/api/labels/${encodeURIComponent(editingLabel.$id)}`, {
                method: 'PATCH',
                headers: await labelsHeaders(),
                body: JSON.stringify({ name, color }),
            });
            const data = await res.json();
            if (data?.sucesso) {
                setLabels((prev) =>
                    prev
                        .map((l) => (l.$id === editingLabel.$id ? data.label : l))
                        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'))
                );
                setEditingLabel(null);
                addToast({ type: 'success', message: 'Etiqueta atualizada.' });
            } else {
                addToast({ type: 'error', message: data?.erro || 'Erro ao editar etiqueta.' });
            }
        } catch {
            addToast({ type: 'error', message: 'Erro de conexão ao editar etiqueta.' });
        }
    };

    const performDeleteLabel = async (label) => {
        try {
            const res = await fetch(`/api/labels/${encodeURIComponent(label.$id)}`, {
                method: 'DELETE',
                headers: await labelsHeaders(),
            });
            const data = await res.json().catch(() => ({}));
            if (data?.sucesso) {
                setExitingIds((m) => ({ ...m, [label.$id]: true }));
                window.setTimeout(() => {
                    setLabels((prev) => prev.filter((l) => l.$id !== label.$id));
                    setExitingIds((m) => {
                        const n = { ...m };
                        delete n[label.$id];
                        return n;
                    });
                }, 220);
                addToast({ type: 'success', message: 'Etiqueta excluída.' });
                return true;
            }
            addToast({ type: 'error', message: data?.erro || 'Erro ao remover etiqueta.' });
            return false;
        } catch {
            addToast({ type: 'error', message: 'Erro de conexão ao remover etiqueta.' });
            return false;
        }
    };

    const requestDeleteLabel = (label) => {
        addToast({
            type: 'warning',
            message: `Excluir etiqueta "${label.name}"?`,
            persistent: true,
            secondaryAction: { label: 'Cancelar', onClick: () => {} },
            actionDanger: true,
            action: {
                label: 'Excluir',
                onClick: async () => performDeleteLabel(label),
            },
        });
    };

    useEffect(
        () => () => {
            if (enterClearRef.current) window.clearTimeout(enterClearRef.current);
        },
        []
    );

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
            <div className="flex justify-between items-center mb-2" style={{ gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <h3 className="navi-section-heading" style={{ margin: 0 }}>Etiquetas</h3>
                    {labels.length > 0 && (
                        <span
                            className="text-small"
                            style={{
                                fontWeight: 700,
                                padding: '2px 9px',
                                borderRadius: 999,
                                background: 'var(--border)',
                                color: 'var(--text-secondary)',
                                lineHeight: 1.3,
                            }}
                        >
                            {labels.length}
                        </span>
                    )}
                </div>
            </div>
            <div className="card">
                <div className="flex-col gap-3">
                    {labelsLoading && (
                        <p className="navi-subtitle" style={{ margin: 0 }}>Carregando...</p>
                    )}

                    {!labelsLoading && labels.length === 0 && (
                        <div
                            style={{
                                textAlign: 'center',
                                padding: '8px 4px 12px',
                                color: 'var(--text-secondary)',
                            }}
                        >
                            <Tag size={36} strokeWidth={1.5} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.55 }} aria-hidden />
                            <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Nenhuma etiqueta criada</div>
                            <p className="text-small" style={{ margin: 0, lineHeight: 1.5, maxWidth: 320, marginLeft: 'auto', marginRight: 'auto' }}>
                                Crie etiquetas para categorizar seus leads no atendimento
                            </p>
                        </div>
                    )}

                    {!labelsLoading && labels.length > 0 && (
                        <div className="flex-col gap-2">
                            {labels.map((label) => (
                                <div
                                    key={label.$id}
                                    className={`funil-label-row ${lastCreatedId === label.$id ? 'funil-label-row-enter' : ''} ${exitingIds[label.$id] ? 'funil-label-row-leave' : ''}`}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    {editingLabel?.$id === label.$id ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
                                            <input
                                                className="form-input"
                                                value={editingLabel.name}
                                                onChange={(e) => setEditingLabel((v) => ({ ...v, name: e.target.value }))}
                                                maxLength={30}
                                                style={{ width: '100%', boxSizing: 'border-box' }}
                                            />
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                                <span className="text-small" style={{ color: 'var(--text-secondary)' }}>Cor:</span>
                                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                                    {PRESET_COLORS.map((c) => (
                                                        <LabelColorSwatch
                                                            key={c}
                                                            color={c}
                                                            selected={editingLabel.color === c}
                                                            onSelect={(col) => setEditingLabel((v) => ({ ...v, color: col }))}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                <button
                                                    type="button"
                                                    className="btn-secondary"
                                                    style={{ padding: '6px 14px', fontSize: 13 }}
                                                    onClick={handleSaveEditLabel}
                                                    disabled={!(editingLabel.name || '').trim() || !String(editingLabel.color || '').trim()}
                                                >
                                                    Salvar
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn-outline"
                                                    style={{ padding: '6px 14px', fontSize: 13 }}
                                                    onClick={() => setEditingLabel(null)}
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <LabelPill label={label} />
                                            {role === 'owner' && (
                                                <div className="flex gap-1" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        title="Editar"
                                                        onClick={() =>
                                                            setEditingLabel({
                                                                $id: label.$id,
                                                                name: label.name,
                                                                color: label.color || '#8E8E8E',
                                                            })
                                                        }
                                                    >
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-btn"
                                                        title="Excluir"
                                                        onClick={() => requestDeleteLabel(label)}
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

                    {role === 'owner' && (
                        <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: labels.length > 0 ? 4 : 0 }}>
                                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                                <span className="text-small" style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontWeight: 600 }}>
                                    Criar etiqueta
                                </span>
                                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 10 }}>
                                    <div style={{ flex: '1 1 220px', minWidth: 200, position: 'relative' }}>
                                        <input
                                            className="form-input"
                                            placeholder="Nome da etiqueta"
                                            value={newLabelName}
                                            onChange={(e) => setNewLabelName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newLabelName.trim() && newLabelColor) handleCreateLabel();
                                            }}
                                            maxLength={30}
                                            style={{ width: '100%', paddingRight: 48, boxSizing: 'border-box' }}
                                        />
                                        <span
                                            className="text-small"
                                            style={{
                                                position: 'absolute',
                                                right: 10,
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                color: 'var(--text-muted)',
                                                pointerEvents: 'none',
                                                fontSize: 12,
                                            }}
                                        >
                                            {newLabelName.length}/30
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={handleCreateLabel}
                                        disabled={!newLabelName.trim() || !newLabelColor}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            whiteSpace: 'nowrap',
                                            padding: '0 14px',
                                            minHeight: 40,
                                        }}
                                    >
                                        <Plus size={16} strokeWidth={2} /> Adicionar
                                    </button>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                    <span className="text-small" style={{ color: 'var(--text-secondary)' }}>Cor:</span>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                        {PRESET_COLORS.map((c) => (
                                            <LabelColorSwatch
                                                key={c}
                                                color={c}
                                                selected={newLabelColor === c}
                                                onSelect={setNewLabelColor}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </section>
        </>
    );
};

export default FunilSection;
