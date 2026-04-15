import React, { useState, useEffect, useCallback } from 'react';
import { Pencil } from 'lucide-react';

function waDigits(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    return d.startsWith('55') ? d : `55${d}`;
}

function formatDateBR(ymd) {
    if (!ymd || String(ymd).length < 10) return '';
    try {
        return new Date(`${String(ymd).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR');
    } catch {
        return '';
    }
}

const EDITABLE_FIELDS = [
    { key: 'plan', label: 'Plano contratado', type: 'text', placeholder: 'Ex.: Mensal, Anual, Semestral' },
    { key: 'enrollmentDate', label: 'Data de ingresso', type: 'date', placeholder: '' },
    { key: 'birthDate', label: 'Data de nascimento', type: 'date', placeholder: '' },
    { key: 'emergencyContact', label: 'Contato de emergência', type: 'text', placeholder: 'Nome do contato' },
    { key: 'emergencyPhone', label: 'Telefone de emergência', type: 'tel', placeholder: 'Celular' },
];

export function StudentPanel({ student, onClose, onSave }) {
    const [form, setForm] = useState({
        plan: student.plan || '',
        enrollmentDate: student.enrollmentDate || '',
        emergencyContact: student.emergencyContact || '',
        emergencyPhone: student.emergencyPhone || '',
        birthDate: student.birthDate || '',
    });
    const [editingKey, setEditingKey] = useState(null);
    const [draft, setDraft] = useState('');
    const [savingKey, setSavingKey] = useState(null);

    useEffect(() => {
        setForm({
            plan: student.plan || '',
            enrollmentDate: student.enrollmentDate || '',
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: student.emergencyPhone || '',
            birthDate: student.birthDate || '',
        });
        setEditingKey(null);
        setDraft('');
    }, [
        student.id,
        student.plan,
        student.enrollmentDate,
        student.emergencyContact,
        student.emergencyPhone,
        student.birthDate,
    ]);

    const startEdit = (key) => {
        if (savingKey) return;
        setEditingKey(key);
        setDraft(String(form[key] ?? ''));
    };

    const cancelEdit = useCallback(() => {
        setEditingKey(null);
        setDraft('');
    }, []);

    const commitRow = async (key) => {
        if (savingKey) return;
        const next = { ...form, [key]: draft };
        setSavingKey(key);
        try {
            await onSave(student.id, next);
            setForm(next);
            setEditingKey(null);
            setDraft('');
        } catch {
            // Feedback de erro fica a cargo do pai (ex.: toast em Students).
        } finally {
            setSavingKey(null);
        }
    };

    const displayForRow = (key) => {
        const raw = form[key];
        if (key === 'enrollmentDate' || key === 'birthDate') {
            const br = formatDateBR(raw);
            return br || '';
        }
        return raw != null && String(raw).trim() ? String(raw).trim() : '';
    };

    const waUrl = waDigits(student.phone) ? `https://wa.me/${waDigits(student.phone)}` : null;

    const inputStyle = {
        padding: '9px 12px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text)',
        fontSize: 14,
        width: '100%',
        boxSizing: 'border-box',
        fontFamily: 'inherit',
    };

    const rowBase = {
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: '12px 14px',
        marginBottom: 8,
    };

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 16,
                }}
            >
                <div>
                    <h2
                        style={{
                            margin: 0,
                            fontSize: 18,
                            fontWeight: 700,
                            color: 'var(--text)',
                        }}
                    >
                        {student.name || 'Sem nome'}
                    </h2>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
                        {[student.type, student.phone].filter((p) => p && String(p).trim()).join(' • ') || '—'}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 20,
                        color: 'var(--text-muted)',
                        padding: 4,
                    }}
                    aria-label="Fechar painel"
                >
                    ✕
                </button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {waUrl ? (
                    <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: 10,
                            background: 'var(--purple)',
                            color: '#fff',
                            textAlign: 'center',
                            textDecoration: 'none',
                            fontSize: 14,
                            fontWeight: 600,
                        }}
                    >
                        WhatsApp
                    </a>
                ) : (
                    <span
                        style={{
                            flex: 1,
                            padding: '10px 0',
                            borderRadius: 10,
                            background: 'var(--border-light)',
                            color: 'var(--text-muted)',
                            textAlign: 'center',
                            fontSize: 14,
                            fontWeight: 600,
                        }}
                    >
                        Sem telefone
                    </span>
                )}
            </div>

            <p
                style={{
                    margin: '0 0 10px',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                }}
            >
                Dados do aluno
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Toque em uma linha para editar. Salve ou cancele antes de editar outro campo.
            </p>

            {EDITABLE_FIELDS.map((field) => {
                const isEditing = editingKey === field.key;
                const isSaving = savingKey === field.key;
                const shown = displayForRow(field.key);

                return (
                    <div
                        key={field.key}
                        style={{
                            ...rowBase,
                            borderColor: isEditing ? 'var(--accent)' : 'var(--border)',
                            boxShadow: isEditing ? '0 0 0 2px var(--accent-light)' : 'none',
                        }}
                    >
                        <div
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.06em',
                                marginBottom: isEditing ? 8 : 6,
                            }}
                        >
                            {field.label}
                        </div>

                        {isEditing ? (
                            <>
                                <input
                                    type={field.type}
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    placeholder={field.placeholder}
                                    disabled={Boolean(savingKey)}
                                    style={inputStyle}
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') cancelEdit();
                                    }}
                                />
                                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                    <button
                                        type="button"
                                        disabled={Boolean(savingKey)}
                                        onClick={() => commitRow(field.key)}
                                        style={{
                                            flex: 1,
                                            padding: '8px 12px',
                                            borderRadius: 8,
                                            border: 'none',
                                            background: 'var(--purple)',
                                            color: '#fff',
                                            fontWeight: 700,
                                            fontSize: 13,
                                            cursor: savingKey ? 'not-allowed' : 'pointer',
                                            opacity: savingKey ? 0.7 : 1,
                                        }}
                                    >
                                        {isSaving ? 'Salvando…' : 'Salvar'}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={Boolean(savingKey)}
                                        onClick={cancelEdit}
                                        style={{
                                            padding: '8px 14px',
                                            borderRadius: 8,
                                            border: '1px solid var(--border)',
                                            background: 'transparent',
                                            color: 'var(--text-secondary)',
                                            fontWeight: 600,
                                            fontSize: 13,
                                            cursor: savingKey ? 'not-allowed' : 'pointer',
                                        }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <button
                                type="button"
                                onClick={() => startEdit(field.key)}
                                disabled={Boolean(editingKey) || Boolean(savingKey)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: 10,
                                    width: '100%',
                                    textAlign: 'left',
                                    border: 'none',
                                    background: 'none',
                                    padding: 0,
                                    cursor: editingKey || savingKey ? 'default' : 'pointer',
                                    fontFamily: 'inherit',
                                }}
                            >
                                <span
                                    style={{
                                        fontSize: 14,
                                        fontWeight: 500,
                                        color: shown ? 'var(--text)' : 'var(--text-muted)',
                                        fontStyle: shown ? 'normal' : 'italic',
                                    }}
                                >
                                    {shown || 'Toque para preencher'}
                                </span>
                                <Pencil size={16} color="var(--text-muted)" aria-hidden />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
