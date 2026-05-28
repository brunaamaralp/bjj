import React, { useState, useEffect, useRef } from 'react';
import { Building2, Phone, Mail, MapPin, Tags, AlertTriangle } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { useTerms } from '../../lib/terminology.js';
import FieldError from '../shared/FieldError.jsx';
import { maskPhone, maskCPFOrCNPJ } from '../../lib/masks.js';

const FISCAL_MASKED = '•••.•••.•••-••';

const ClockIcon = () => (
    <span
        style={{
            display: 'inline-flex',
            width: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
        }}
    >
        ⏱️
    </span>
);

const InfoRow = ({ icon, label, value, showAddInline, onAdd, action }) => (
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
        {action ? <span className="info-row-action">{action}</span> : null}
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
    const terms = useTerms();
    const addToast = useUiStore((s) => s.addToast);
    const role = useUserRole(academy);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [fieldErrors, setFieldErrors] = useState({});
    const [focusTaxOnEdit, setFocusTaxOnEdit] = useState(false);
    const didAutoOpenTax = useRef(false);

    useEffect(() => {
        if (autoEditTax && taxUpdateNeeded && role === 'owner' && !didAutoOpenTax.current) {
            didAutoOpenTax.current = true;
            setEditing(true);
            setFocusTaxOnEdit(true);
        }
    }, [autoEditTax, taxUpdateNeeded, role]);

    useEffect(() => {
        if (!editing || !focusTaxOnEdit) return undefined;
        const t = window.setTimeout(() => {
            taxInputRef?.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
            taxInputRef?.current?.focus?.();
            setFocusTaxOnEdit(false);
        }, 80);
        return () => window.clearTimeout(t);
    }, [editing, focusTaxOnEdit, taxInputRef]);

    const openFiscalEdit = () => {
        setEditing(true);
        setFocusTaxOnEdit(true);
    };

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
            await onSave({
                successMessage: `Dados da ${terms.workspaceNoun} salvos.`,
            });
            setEditing(false);
        } catch {
            // Error handled in onSave
        } finally {
            setSaving(false);
        }
    };

    const verticalLabel =
        academy.vertical === 'physio' ? 'Fisioterapia' : 'Academia / Artes marciais';

    const showFiscalBlock = billingLive && role === 'owner';

    const fiscalEditButton = (
        <button type="button" className="academy-field-add-link" onClick={openFiscalEdit}>
            Editar dados fiscais
        </button>
    );

    return (
        <section className="empresa-section animate-in" style={{ animationDelay: '0.05s' }}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="navi-section-heading">Identidade</h3>
                {role === 'owner' && !editing && (
                    <button type="button" className="edit-link" onClick={() => setEditing(true)}>
                        Editar
                    </button>
                )}
            </div>

            <div className="card">
                {editing ? (
                    <div className="flex-col gap-4">
                        <div className="form-group">
                            <label>Nome da {terms.workspaceNounTitle}</label>
                            <input
                                className="form-input"
                                value={academy.name}
                                onChange={(e) => setAcademy({ ...academy, name: e.target.value })}
                                placeholder="Ex: Team BJJ"
                            />
                        </div>
                        <div className="form-group">
                            <label>Telefone</label>
                            <input
                                className="form-input"
                                value={academy.phone}
                                onChange={(e) => setAcademy({ ...academy, phone: maskPhone(e.target.value) })}
                                placeholder="(00) 00000-0000"
                                type="tel"
                                inputMode="numeric"
                            />
                            {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
                        </div>
                        <div className="form-group">
                            <label>E-mail</label>
                            <input
                                className="form-input"
                                type="email"
                                value={academy.email}
                                onChange={(e) => setAcademy({ ...academy, email: e.target.value })}
                                placeholder="contato@academia.com"
                            />
                            {fieldErrors.email ? <FieldError>{fieldErrors.email}</FieldError> : null}
                        </div>
                        <div className="form-group">
                            <label>Endereço</label>
                            <input
                                className="form-input"
                                value={academy.address}
                                onChange={(e) => setAcademy({ ...academy, address: e.target.value })}
                                placeholder="Rua, número, bairro"
                            />
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
                    </div>
                )}
            </div>

            <div className="funil-section-divider" role="separator" aria-hidden="true" />

            <h3 className="navi-section-heading mb-2">Configurações operacionais</h3>

            <div className="card">
                {editing ? (
                    <div className="flex-col gap-4">
                        {role === 'owner' ? (
                            <div className="form-group">
                                <label>Tipo de negócio</label>
                                <div className="estudio-vertical-alert" role="note">
                                    <AlertTriangle size={16} aria-hidden />
                                    <span>
                                        Altera a terminologia em todo o sistema — ex.: &quot;aluno&quot; vira
                                        &quot;paciente&quot; ao escolher Fisioterapia.
                                    </span>
                                </div>
                                <select
                                    className="form-input"
                                    style={{ maxWidth: 360 }}
                                    value={academy.vertical || 'fitness'}
                                    onChange={(e) =>
                                        setAcademy({
                                            ...academy,
                                            vertical: e.target.value === 'physio' ? 'physio' : 'fitness',
                                        })
                                    }
                                >
                                    <option value="fitness">Academia / Artes marciais</option>
                                    <option value="physio">Fisioterapia</option>
                                </select>
                            </div>
                        ) : null}
                        {showFiscalBlock && taxUpdateNeeded && setTaxDocumentInput ? (
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
                        {showFiscalBlock && companyTaxRegistered && !taxUpdateNeeded ? (
                            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                                CPF/CNPJ cadastrado para cobrança.
                            </p>
                        ) : null}
                        <div className="form-group">
                            <label>Horários rápidos (reagendar)</label>
                            <input
                                className="form-input"
                                value={academy.quickTimes}
                                onChange={(e) => setAcademy({ ...academy, quickTimes: e.target.value })}
                                placeholder="Ex: 18:00, 19:00, 20:00"
                            />
                            <p className="text-xs text-light" style={{ marginTop: 6, lineHeight: 1.45 }}>
                                Separe por vírgulas (formato 24h). Esses horários aparecem nos cards de aluno
                                quando há falta registrada no funil de vendas.
                            </p>
                            {fieldErrors.quickTimes ? (
                                <FieldError>{fieldErrors.quickTimes}</FieldError>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <div className="flex-col gap-2">
                        <InfoRow
                            icon={<Tags size={16} />}
                            label="Tipo de negócio"
                            value={verticalLabel}
                            showAddInline={role === 'owner'}
                            onAdd={() => setEditing(true)}
                        />
                        {showFiscalBlock && taxUpdateNeeded ? (
                            <div className="estudio-fiscal-alert" role="alert">
                                <span className="text-small" style={{ fontWeight: 600, lineHeight: 1.45 }}>
                                    Falta cadastrar CPF/CNPJ para nota fiscal.
                                </span>
                                {fiscalEditButton}
                            </div>
                        ) : null}
                        {showFiscalBlock && companyTaxRegistered && !taxUpdateNeeded ? (
                            <InfoRow
                                icon={<Building2 size={16} />}
                                label="CPF/CNPJ"
                                value={FISCAL_MASKED}
                                action={fiscalEditButton}
                            />
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

            {editing ? (
                <div className="flex gap-2 mt-4">
                    <button
                        type="button"
                        className="btn-outline"
                        style={{ flex: 1 }}
                        onClick={() => setEditing(false)}
                        disabled={saving}
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        className="btn-primary"
                        style={{ flex: 2 }}
                        onClick={() => void handleSave()}
                        disabled={saving}
                    >
                        {saving ? 'Salvando...' : 'Salvar'}
                    </button>
                </div>
            ) : null}

            <style
                dangerouslySetInnerHTML={{
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
          white-space: nowrap;
        }
        .academy-field-add-link:hover {
          text-decoration: underline;
        }
        .info-row {
          flex-wrap: wrap;
        }
        .info-row-action {
          margin-left: auto;
          flex-shrink: 0;
        }
        .estudio-vertical-alert {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 10px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.35);
          font-size: 0.8rem;
          line-height: 1.45;
          color: var(--text);
          font-weight: 500;
        }
        .estudio-vertical-alert svg {
          flex-shrink: 0;
          margin-top: 2px;
          color: #b45309;
        }
        .estudio-fiscal-alert {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 8px;
          background: var(--accent-light);
        }
      `,
                }}
            />
        </section>
    );
};

export default EstudioSection;
