import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Plus, X, ChevronRight, Tag, Pencil, Settings2 } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL, account } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { contactLabelSingular } from '../../lib/terminology.js';
import { normalizeQuestionType } from '../../lib/customLeadQuestions.js';
import LabelPill from '../shared/LabelPill';
import EmptyState from '../shared/EmptyState.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { LABEL_PRESET_COLORS } from '../../lib/labelPresetColors.js';

const QUESTION_LABEL_MAX = 30;

const QUESTION_TYPE_LABELS = {
    text: 'Texto',
    number: 'Número',
    boolean: 'Sim / Não',
    select: 'Lista',
};

function LabelColorSwatch({ preset, selected, onSelect }) {
    const hex = preset.hex;
    const bg = preset.cssVar ? `var(${preset.cssVar})` : hex;
    return (
        <button
            type="button"
            className={`funil-color-swatch${selected ? ' funil-color-swatch--selected' : ''}`}
            aria-label={`Selecionar cor ${hex}`}
            aria-pressed={selected}
            onClick={() => onSelect(hex)}
            style={{ '--swatch-color': bg, '--swatch-ring': hex }}
        />
    );
}

function LabelColorPicker({ value, onChange, showRequiredHint = false }) {
    return (
        <div className="funil-color-picker">
            <span className="funil-color-picker__label">Cor</span>
            <div className="funil-color-swatch-group" role="group" aria-label="Cor da etiqueta">
                {LABEL_PRESET_COLORS.map((preset) => (
                    <LabelColorSwatch
                        key={preset.hex}
                        preset={preset}
                        selected={value === preset.hex}
                        onSelect={onChange}
                    />
                ))}
            </div>
            {showRequiredHint && !value ? (
                <p className="funil-color-hint" role="status">
                    Selecione uma cor para continuar
                </p>
            ) : null}
        </div>
    );
}

function serializeLeadQuestions(qs) {
    const arr = Array.isArray(qs) ? qs : [];
    return JSON.stringify(
        arr.map((q) => {
            const base = {
                id: String(q?.id || ''),
                label: String(q?.label || ''),
                type: normalizeQuestionType(q?.type),
            };
            if (Array.isArray(q?.options) && q.options.length > 0) {
                return { ...base, options: q.options.map((x) => String(x)) };
            }
            return base;
        })
    );
}

function QuestionRow({
    q,
    idx,
    total,
    canEdit,
    onLabelChange,
    onTypeChange,
    onOptionsChange,
    onRemove,
    onMoveUp,
    onMoveDown,
}) {
    const [expanded, setExpanded] = useState(false);
    const type = normalizeQuestionType(q?.type);
    const typeLabel = QUESTION_TYPE_LABELS[type] || 'Texto';

    return (
        <div className="funil-question-row">
            <div className="funil-question-row-main">
                <div className="funil-question-field-wrap">
                    <input
                        className="form-input"
                        value={q?.label || ''}
                        placeholder="Pergunta"
                        readOnly={!canEdit}
                        maxLength={QUESTION_LABEL_MAX}
                        onChange={(e) => onLabelChange(e.target.value)}
                    />
                    {canEdit ? (
                        <span className="funil-char-counter" aria-hidden>
                            {(q?.label || '').length}/{QUESTION_LABEL_MAX}
                        </span>
                    ) : null}
                </div>
                <span className="funil-question-type-pill" title="Tipo da resposta">
                    {typeLabel}
                </span>
                {canEdit && (
                    <div className="funil-question-actions">
                        <button
                            type="button"
                            className="icon-btn icon-only"
                            title={expanded ? 'Fechar configuração' : 'Configurar tipo e opções'}
                            aria-expanded={expanded}
                            onClick={() => setExpanded((v) => !v)}
                        >
                            <Settings2 size={14} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn icon-only"
                            title="Mover para cima"
                            disabled={idx <= 0}
                            onClick={onMoveUp}
                        >
                            <ChevronRight size={14} style={{ transform: 'rotate(-90deg)' }} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn icon-only"
                            title="Mover para baixo"
                            disabled={idx >= total - 1}
                            onClick={onMoveDown}
                        >
                            <ChevronRight size={14} style={{ transform: 'rotate(90deg)' }} />
                        </button>
                        <button
                            type="button"
                            className="icon-btn icon-only"
                            title="Remover"
                            onClick={onRemove}
                        >
                            <X size={14} />
                        </button>
                    </div>
                )}
            </div>
            {expanded && canEdit && (
                <div className="funil-question-detail">
                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="info-mini-label" style={{ display: 'block', marginBottom: 4 }}>
                            Tipo de resposta
                        </label>
                        <select
                            className="form-input"
                            value={type}
                            onChange={(e) => onTypeChange(e.target.value)}
                        >
                            <option value="text">Texto</option>
                            <option value="number">Número</option>
                            <option value="boolean">Sim / Não</option>
                            <option value="select">Lista</option>
                        </select>
                    </div>
                    {type === 'select' && (
                        <div className="form-group" style={{ margin: 0 }}>
                            <label className="info-mini-label" style={{ display: 'block', marginBottom: 4 }}>
                                Opções (separadas por vírgula)
                            </label>
                            <input
                                className="form-input"
                                value={Array.isArray(q?.options) ? q.options.join(', ') : (q?.options || '')}
                                placeholder="Ex: Iniciante, Intermediário, Avançado"
                                onChange={(e) => onOptionsChange(e.target.value)}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const FunilSection = ({ academy, setAcademy, academyId, academyDataVersion = 0 }) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [newQuestion, setNewQuestion] = useState('');
    const [saving, setSaving] = useState(false);

    const contactLabel = useMemo(
        () => contactLabelSingular(academy?.uiLabels),
        [academy?.uiLabels]
    );
    const questionsHeading = `Perguntas do ${contactLabel}`;

    // ── Labels state ──────────────────────────────────────────────────────────
    const [labels, setLabels] = useState([]);
    const [newLabelName, setNewLabelName] = useState('');
    const [newLabelColor, setNewLabelColor] = useState('');
    const [editingLabel, setEditingLabel] = useState(null); // { $id, name, color }
    const [labelsLoading, setLabelsLoading] = useState(false);
    const [labelsError, setLabelsError] = useState(false);
    const [creatingLabel, setCreatingLabel] = useState(false);
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

    const [savedQuestionsDigest, setSavedQuestionsDigest] = useState('');

    useEffect(() => {
        if (!academyId) return;
        setSavedQuestionsDigest(serializeLeadQuestions(academy.customLeadQuestions));
    }, [academyId, academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps -- baseline após carga

    const hasUnsavedChanges = useMemo(
        () => serializeLeadQuestions(academy.customLeadQuestions) !== savedQuestionsDigest,
        [academy.customLeadQuestions, savedQuestionsDigest]
    );

    const updateQuestionAt = useCallback(
        (id, idx, patch) => {
            setAcademy((a) => ({
                ...a,
                customLeadQuestions: (a.customLeadQuestions || []).map((it, i) => {
                    if (id && it?.id === id) return { ...it, ...patch };
                    if (!id && i === idx) return { ...it, ...patch };
                    return it;
                }),
            }));
        },
        [setAcademy]
    );

    const saveQuestions = async (qs) => {
        if (!academyId) return;
        const normalized = (qs || []).map((q) => ({
            ...q,
            type: normalizeQuestionType(q?.type),
        }));
        setSaving(true);
        try {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
                customLeadQuestions: JSON.stringify(normalized)
            });
            setAcademy(a => ({ ...a, customLeadQuestions: normalized }));
            setSavedQuestionsDigest(serializeLeadQuestions(normalized));
            addToast({ type: 'success', message: `Perguntas do ${contactLabel.toLowerCase()} salvas.` });
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
        setLabelsError(false);
        try {
            const res = await fetch(`/api/labels`, { headers: await labelsHeaders() });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.sucesso) {
                setLabels(data.labels || []);
            } else {
                setLabels([]);
                setLabelsError(true);
            }
        } catch {
            setLabels([]);
            setLabelsError(true);
        } finally {
            setLabelsLoading(false);
        }
    };

    useEffect(() => { fetchLabels(); }, [academyId]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleCreateLabel = async () => {
        const name = newLabelName.trim();
        const color = String(newLabelColor || '').trim();
        if (!name || !color) return;
        setCreatingLabel(true);
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
        } finally {
            setCreatingLabel(false);
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

    const requestRemoveQuestion = (q, idx) => {
        const name = (q?.label || '').trim() || 'esta pergunta';
        addToast({
            type: 'warning',
            message: `Remover pergunta "${name}"?`,
            persistent: true,
            secondaryAction: { label: 'Cancelar', onClick: () => {} },
            actionDanger: true,
            action: {
                label: 'Remover',
                onClick: () => handleRemoveQuestion(q?.id, idx),
            },
        });
    };

    const moveQuestion = (idx, direction) => {
        const list = [...(academy.customLeadQuestions || [])];
        const target = idx + direction;
        if (target < 0 || target >= list.length) return;
        const [item] = list.splice(idx, 1);
        list.splice(target, 0, item);
        setAcademy((a) => ({ ...a, customLeadQuestions: list }));
    };

    const questions = academy.customLeadQuestions || [];

    return (
        <>
        <section className="empresa-section mt-4 animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex justify-between items-center mb-2" style={{ gap: 10, flexWrap: 'wrap' }}>
                <h3 className="navi-section-heading" style={{ margin: 0 }}>{questionsHeading}</h3>
                {hasUnsavedChanges && role === 'owner' && (
                    <span className="funil-unsaved-pill" role="status">
                        Alterações não salvas
                    </span>
                )}
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
                            <button type="button" className="btn-secondary" onClick={handleAddQuestion}>
                                <Plus size={16} /> Adicionar
                            </button>
                        </div>
                    )}
                    <div className="flex-col gap-2">
                        {questions.map((q, idx) => (
                            <QuestionRow
                                key={`${q?.id || q?.label || idx}`}
                                q={q}
                                idx={idx}
                                total={questions.length}
                                canEdit={role === 'owner'}
                                onLabelChange={(value) => updateQuestionAt(q?.id, idx, { label: value })}
                                onTypeChange={(value) =>
                                    updateQuestionAt(q?.id, idx, {
                                        type: normalizeQuestionType(value),
                                    })
                                }
                                onOptionsChange={(raw) => {
                                    const arr = raw.split(',').map((s) => s.trim()).filter(Boolean);
                                    updateQuestionAt(q?.id, idx, { options: arr });
                                }}
                                onRemove={() => requestRemoveQuestion(q, idx)}
                                onMoveUp={() => moveQuestion(idx, -1)}
                                onMoveDown={() => moveQuestion(idx, 1)}
                            />
                        ))}
                        {questions.length === 0 && (
                            <EmptyState
                                variant="compact"
                                tone="dashed"
                                title="Nenhuma pergunta configurada."
                                description={
                                    role === 'owner'
                                        ? `Adicione perguntas personalizadas para acompanhar no perfil do ${contactLabel.toLowerCase()}.`
                                        : undefined
                                }
                                role="status"
                            />
                        )}
                    </div>
                    {role === 'owner' && (
                        <div className="flex gap-2 mt-2">
                            <button
                                type="button"
                                className="btn-primary"
                                onClick={() => void saveQuestions(questions)}
                                disabled={saving || !hasUnsavedChanges}
                            >
                                {saving ? 'Salvando...' : 'Salvar alterações'}
                            </button>
                        </div>
                    )}
                    <p className="text-xs text-light">
                        As respostas são preenchidas no card do {contactLabel.toLowerCase()}.
                    </p>
                </div>
            </div>
        </section>

        <div className="funil-section-divider" role="separator" aria-hidden="true" />

        {/* Etiquetas: persistência imediata via API (diferente das perguntas, que exigem "Salvar alterações"). */}
        <section className="empresa-section animate-in" style={{ animationDelay: '0.1s' }}>
            <p className="funil-section-subheading">Organização</p>
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
            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
                Criar, editar ou excluir etiquetas salva na hora — não é preciso usar o botão de salvar das perguntas.
            </p>
            <div className="card">
                <div className="flex-col gap-3">
                    {labelsError && !labelsLoading && (
                        <ErrorBanner
                            message="Não foi possível carregar as etiquetas."
                            onRetry={() => void fetchLabels()}
                        />
                    )}
                    {labelsLoading && (
                        <p className="navi-subtitle" style={{ margin: 0 }}>Carregando...</p>
                    )}

                    {!labelsLoading && !labelsError && labels.length === 0 && (
                        <EmptyState
                            variant="compact"
                            tone="dashed"
                            icon={Tag}
                            title="Nenhuma etiqueta criada"
                            description={`Crie etiquetas para categorizar seus ${String(academy?.uiLabels?.leads || 'leads').toLowerCase()} no atendimento.`}
                            role="status"
                        />
                    )}

                    {!labelsLoading && !labelsError && labels.length > 0 && (
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
                                            <LabelColorPicker
                                                value={editingLabel.color}
                                                onChange={(col) => setEditingLabel((v) => ({ ...v, color: col }))}
                                            />
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
                                            <LabelPill label={label} showDot={false} fullName />
                                            {role === 'owner' && (
                                                <div className="flex gap-1" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                                    <button
                                                        type="button"
                                                        className="icon-btn icon-only funil-label-edit-btn"
                                                        title="Editar etiqueta"
                                                        aria-label="Editar etiqueta"
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
                                                        className="icon-btn icon-only"
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
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <LabelColorPicker
                                    value={newLabelColor}
                                    onChange={setNewLabelColor}
                                    showRequiredHint
                                />
                                <div className="funil-label-create-row">
                                    <div className="funil-label-name-field">
                                        <input
                                            className="form-input"
                                            placeholder="Nome da etiqueta"
                                            value={newLabelName}
                                            onChange={(e) => setNewLabelName(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' && newLabelName.trim() && newLabelColor && !creatingLabel) {
                                                    void handleCreateLabel();
                                                }
                                            }}
                                            maxLength={30}
                                        />
                                        <span className="funil-char-counter" aria-hidden>
                                            {newLabelName.length}/30
                                        </span>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn-secondary"
                                        onClick={() => void handleCreateLabel()}
                                        disabled={!newLabelName.trim() || !newLabelColor || creatingLabel}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                            whiteSpace: 'nowrap',
                                            padding: '0 14px',
                                            minHeight: 40,
                                            alignSelf: 'flex-start',
                                        }}
                                    >
                                        <Plus size={16} strokeWidth={2} />
                                        {creatingLabel ? 'Adicionando…' : 'Adicionar'}
                                    </button>
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
