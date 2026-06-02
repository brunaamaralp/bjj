import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, X, ChevronRight, Settings2 } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { contactLabelSingular } from '../../lib/terminology.js';
import { normalizeQuestionType } from '../../lib/customLeadQuestions.js';
import EmptyState from '../shared/EmptyState.jsx';

const QUESTION_LABEL_MAX = 30;

const QUESTION_TYPE_LABELS = {
    text: 'Texto',
    number: 'Número',
    boolean: 'Sim / Não',
    select: 'Lista',
};

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
    );
};

export default FunilSection;
