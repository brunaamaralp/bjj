import React, { useState, useEffect, useRef } from 'react';
import { Building2, Phone, Mail, MapPin } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { maskPhone, maskCPFOrCNPJ } from '../../lib/masks.js';

const ClockIcon = () => <span style={{ display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>⏱️</span>;

const InfoRow = ({ icon, label, value, showAddInline, onAdd }) => (
    <div className="info-row">
        <span className="info-row-icon">{icon}</span>
        <span className="info-row-label">{label}</span>
        {value ? (
            <span className="info-row-value">{value}</span>
        ) : (
            <span className="info-row-empty">
                Não informado
                {showAddInline && typeof onAdd === 'function' ? (
                    <>
                        {' '}
                        <button type="button" className="academy-field-add-link" onClick={onAdd}>
                            Adicionar →
                        </button>
                    </>
                ) : null}
            </span>
        )}
    </div>
);

const EstudioSection = ({
    academy,
    setAcademy,
    onSave,
    taxUpdateNeeded = false,
    companyTaxRegistered = false,
    billingLive = false,
    taxDocumentInput = '',
    setTaxDocumentInput,
    taxInputRef,
    autoEditTax = false,
}) => {
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const didAutoOpenTax = useRef(false);

    useEffect(() => {
        if (autoEditTax && taxUpdateNeeded && role === 'owner' && !didAutoOpenTax.current) {
            didAutoOpenTax.current = true;
            setEditing(true);
        }
    }, [autoEditTax, taxUpdateNeeded, role]);

    const parseQuickTimes = (input) => {
        const asText = String(input || '').trim();
        if (!asText) return [];
        const uniq = [];
        const seen = new Set();
        for (const part of asText.split(',')) {
            const item = String(part || '').trim();
            if (!item) continue;
            if (!seen.has(item)) {
                uniq.push(item);
                seen.add(item);
            }
        }
        return uniq;
    };

    const validateAcademy = () => {
        const errors = {};
        const email = String(academy.email || '').trim();
        const phoneDigits = String(academy.phone || '').replace(/\D/g, '');
        const quick = parseQuickTimes(academy.quickTimes);

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.email = 'Informe um e-mail válido (ex.: contato@academia.com).';
        }
        if (phoneDigits && phoneDigits.length < 10) {
            errors.phone = 'Telefone incompleto. Use DDD + número.';
        }
        if (quick.length > 0) {
            const bad = quick.find((t) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(t));
            if (bad) {
                errors.quickTimes = `Horário inválido: "${bad}". Use HH:MM (24h), separado por vírgula.`;
            }
        }

        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validateAcademy()) {
            addToast({ type: 'error', message: 'Corrija os campos destacados antes de salvar.' });
            return;
        }
        setSaving(true);
        try {
            await onSave();
            setEditing(false);
        } catch {
            // Error handled in onSave
        } finally {
            setSaving(false);
        }
    };

    return (
        <section className="empresa-section animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Dados da Academia</h3>
                {role === 'owner' && !editing && (
                    <button className="edit-link" onClick={() => setEditing(true)}>Editar</button>
                )}
            </div>

            <div className="card">
                {editing ? (
                    <div className="flex-col gap-4">
                        <div className="form-group">
                            <label>Nome da Academia</label>
                            <input className="form-input" value={academy.name}
                                onChange={e => setAcademy({ ...academy, name: e.target.value })}
                                placeholder="Ex: Team BJJ" />
                        </div>
                        <div className="form-group">
                            <label>Telefone</label>
                            <input className="form-input" value={academy.phone}
                                onChange={e => setAcademy({ ...academy, phone: maskPhone(e.target.value) })}
                                placeholder="(00) 00000-0000"
                                type="tel"
                                inputMode="numeric" />
                            {fieldErrors.phone ? <p className="field-error">{fieldErrors.phone}</p> : null}
                        </div>
                        <div className="form-group">
                            <label>E-mail</label>
                            <input className="form-input" type="email" value={academy.email}
                                onChange={e => setAcademy({ ...academy, email: e.target.value })}
                                placeholder="contato@academia.com" />
                            {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
                        </div>
                        <div className="form-group">
                            <label>Endereço</label>
                            <input className="form-input" value={academy.address}
                                onChange={e => setAcademy({ ...academy, address: e.target.value })}
                                placeholder="Rua, número, bairro" />
                        </div>
                        {billingLive && role === 'owner' && taxUpdateNeeded && setTaxDocumentInput ? (
                            <div className="form-group" id="navi-academy-tax" ref={taxInputRef}>
                                <label>CPF ou CNPJ (nota fiscal)</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    inputMode="numeric"
                                    value={taxDocumentInput}
                                    onChange={(e) => setTaxDocumentInput(maskCPFOrCNPJ(e.target.value))}
                                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                                    autoComplete="off"
                                    maxLength={20}
                                    aria-label="CPF ou CNPJ"
                                />
                                <p className="text-xs text-light" style={{ marginTop: 6 }}>
                                    Usado na cobrança. Se já informou ao assinar, pode ignorar.
                                </p>
                            </div>
                        ) : null}
                        {billingLive && role === 'owner' && companyTaxRegistered && !taxUpdateNeeded ? (
                            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                CPF/CNPJ cadastrado para cobrança.
                            </p>
                        ) : null}
                        <div className="form-group">
                            <label>Horários rápidos (reagendar)</label>
                            <input className="form-input" value={academy.quickTimes}
                                onChange={e => setAcademy({ ...academy, quickTimes: e.target.value })}
                                placeholder="Ex: 18:00, 19:00, 20:00" />
                            <p className="text-xs text-light">Separe por vírgulas. Exibidos nos cards de "Não Compareceu".</p>
                            {fieldErrors.quickTimes ? <p className="field-error">{fieldErrors.quickTimes}</p> : null}
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
                        <InfoRow icon={<Building2 size={16} />} label="Nome" value={academy.name} />
                        <InfoRow
                            icon={<Phone size={16} />}
                            label="Telefone"
                            value={academy.phone ? maskPhone(String(academy.phone)) : ''}
                            showAddInline={role === 'owner'}
                            onAdd={() => setEditing(true)}
                        />
                        <InfoRow icon={<Mail size={16} />} label="E-mail" value={academy.email} />
                        <InfoRow
                            icon={<MapPin size={16} />}
                            label="Endereço"
                            value={academy.address}
                            showAddInline={role === 'owner'}
                            onAdd={() => setEditing(true)}
                        />
                        {billingLive && role === 'owner' && taxUpdateNeeded ? (
                            <div
                                className="info-row"
                                style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '12px 10px' }}
                            >
                                <span className="info-row-label" style={{ minWidth: 'auto' }}>
                                    Fiscal
                                </span>
                                <span className="text-small" style={{ color: 'var(--text)', fontWeight: 600 }}>
                                    Falta cadastrar CPF/CNPJ para nota fiscal. Toque em Editar.
                                </span>
                            </div>
                        ) : null}
                        {billingLive && role === 'owner' && companyTaxRegistered && !taxUpdateNeeded ? (
                            <InfoRow icon={<Building2 size={16} />} label="Fiscal" value="CPF/CNPJ cadastrado" />
                        ) : null}
                        <InfoRow
                            icon={<ClockIcon />}
                            label="Horários rápidos"
                            value={academy.quickTimes}
                            showAddInline={role === 'owner'}
                            onAdd={() => setEditing(true)}
                        />
                    </div>
                )}
            </div>
            <style dangerouslySetInnerHTML={{
                __html: `
        .academy-field-add-link {
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          font-size: 12px;
          font-weight: 600;
          color: var(--accent);
          cursor: pointer;
          text-decoration: none;
          font-family: inherit;
        }
        .academy-field-add-link:hover {
          text-decoration: underline;
        }
      `,
            }} />
        </section>
    );
};

export default EstudioSection;
