import React, { useState, useEffect } from 'react';

function waDigits(phone) {
    const d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    return d.startsWith('55') ? d : `55${d}`;
}

export function StudentPanel({ student, onClose, onSave }) {
    const [tab, setTab] = useState('info');
    const [form, setForm] = useState({
        plan: student.plan || '',
        enrollmentDate: student.enrollmentDate || '',
        emergencyContact: student.emergencyContact || '',
        emergencyPhone: student.emergencyPhone || '',
        birthDate: student.birthDate || '',
    });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setTab('info');
    }, [student.id]);

    useEffect(() => {
        setForm({
            plan: student.plan || '',
            enrollmentDate: student.enrollmentDate || '',
            emergencyContact: student.emergencyContact || '',
            emergencyPhone: student.emergencyPhone || '',
            birthDate: student.birthDate || '',
        });
    }, [
        student.id,
        student.plan,
        student.enrollmentDate,
        student.emergencyContact,
        student.emergencyPhone,
        student.birthDate,
    ]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(student.id, form);
            setTab('info');
        } finally {
            setSaving(false);
        }
    };

    const waUrl = waDigits(student.phone) ? `https://wa.me/${waDigits(student.phone)}` : null;

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: 20,
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

            <div
                style={{
                    display: 'flex',
                    gap: 4,
                    marginBottom: 20,
                    borderBottom: '1px solid var(--border)',
                    paddingBottom: 0,
                }}
            >
                {['info', 'edit'].map((t) => (
                    <button
                        key={t}
                        type="button"
                        onClick={() => setTab(t)}
                        style={{
                            padding: '8px 16px',
                            border: 'none',
                            cursor: 'pointer',
                            background: 'none',
                            fontWeight: tab === t ? 700 : 400,
                            color: tab === t ? 'var(--purple)' : 'var(--text-muted)',
                            borderBottom: tab === t ? '2px solid var(--purple)' : '2px solid transparent',
                            fontSize: 14,
                            transition: 'all 0.15s',
                        }}
                    >
                        {t === 'info' ? 'Informações' : 'Editar'}
                    </button>
                ))}
            </div>

            {tab === 'info' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'flex', gap: 8 }}>
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

                    <InfoCard title="Plano">
                        <InfoRow label="Plano" value={student.plan} />
                        <InfoRow
                            label="Ingresso"
                            value={
                                student.enrollmentDate
                                    ? new Date(`${student.enrollmentDate}T12:00:00`).toLocaleDateString('pt-BR')
                                    : null
                            }
                        />
                        <InfoRow
                            label="Aniversário"
                            value={
                                student.birthDate
                                    ? new Date(`${student.birthDate}T12:00:00`).toLocaleDateString('pt-BR')
                                    : null
                            }
                        />
                    </InfoCard>

                    <InfoCard title="Emergência">
                        <InfoRow label="Contato" value={student.emergencyContact} />
                        <InfoRow label="Telefone" value={student.emergencyPhone} />
                    </InfoCard>
                </div>
            )}

            {tab === 'edit' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <Field label="Plano contratado">
                        <input
                            type="text"
                            value={form.plan}
                            onChange={(e) => setForm((f) => ({ ...f, plan: e.target.value }))}
                            placeholder="Ex: Mensal, Anual, Semestral"
                        />
                    </Field>

                    <Field label="Data de ingresso">
                        <input
                            type="date"
                            value={form.enrollmentDate}
                            onChange={(e) => setForm((f) => ({ ...f, enrollmentDate: e.target.value }))}
                        />
                    </Field>

                    <Field label="Data de nascimento">
                        <input
                            type="date"
                            value={form.birthDate}
                            onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
                        />
                    </Field>

                    <Field label="Contato de emergência (nome)">
                        <input
                            type="text"
                            value={form.emergencyContact}
                            onChange={(e) => setForm((f) => ({ ...f, emergencyContact: e.target.value }))}
                            placeholder="Ex: Maria (mãe)"
                        />
                    </Field>

                    <Field label="Telefone de emergência">
                        <input
                            type="tel"
                            value={form.emergencyPhone}
                            onChange={(e) => setForm((f) => ({ ...f, emergencyPhone: e.target.value }))}
                            placeholder="(37) 99999-9999"
                        />
                    </Field>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                            padding: '12px 0',
                            borderRadius: 10,
                            border: 'none',
                            background: 'var(--purple)',
                            color: '#fff',
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.7 : 1,
                            marginTop: 4,
                        }}
                    >
                        {saving ? 'Salvando...' : 'Salvar alterações'}
                    </button>
                </div>
            )}
        </div>
    );
}

function InfoCard({ title, children }) {
    return (
        <div
            style={{
                borderRadius: 10,
                border: '1px solid var(--border)',
                padding: 14,
                background: 'var(--surface)',
            }}
        >
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
                {title}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
        </div>
    );
}

function InfoRow({ label, value }) {
    if (value == null || String(value).trim() === '') return null;
    return (
        <div
            style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 14,
                gap: 12,
            }}
        >
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ color: 'var(--text)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
            {React.cloneElement(children, {
                style: {
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontSize: 14,
                    width: '100%',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    ...(children.props.style || {}),
                },
            })}
        </label>
    );
}
