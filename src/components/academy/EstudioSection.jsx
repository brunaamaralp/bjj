import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Building2, Phone, Mail, MapPin, Tags, AlertTriangle } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { useTerms } from '../../lib/terminology.js';
import FieldError from '../shared/FieldError.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import SettingsStickySave from '../shared/settings/SettingsStickySave.jsx';
import { maskPhone, maskCPFOrCNPJ } from '../../lib/masks.js';
import '../finance/finance.css';

const FISCAL_MASKED = '•••.•••.•••-••';

function buildStudioSnapshot(academy, taxDocumentInput) {
  return JSON.stringify({
    name: String(academy?.name || '').trim(),
    phone: String(academy?.phone || '').replace(/\D/g, ''),
    email: String(academy?.email || '').trim(),
    address: String(academy?.address || '').trim(),
    quickTimes: String(academy?.quickTimes || '').trim(),
    vertical: academy?.vertical === 'physio' ? 'physio' : 'fitness',
    taxDocumentInput: String(taxDocumentInput || '').trim(),
  });
}

function formatQuickTimesPreview(input) {
  const parts = String(input || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
}

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
  academyDataVersion = 0,
}) => {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const canEdit = role === 'owner';
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [savedDigest, setSavedDigest] = useState(() => buildStudioSnapshot(academy, taxDocumentInput));
  const [pendingVertical, setPendingVertical] = useState(null);
  const didAutoFocusTax = useRef(false);

  useEffect(() => {
    setSavedDigest(buildStudioSnapshot(academy, ''));
    setFieldErrors({});
  }, [academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoEditTax && taxUpdateNeeded && canEdit && !didAutoFocusTax.current) {
      didAutoFocusTax.current = true;
      const t = window.setTimeout(() => {
        taxInputRef?.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        taxInputRef?.current?.focus?.();
      }, 120);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [autoEditTax, taxUpdateNeeded, canEdit, taxInputRef]);

  const currentDigest = useMemo(
    () => buildStudioSnapshot(academy, taxDocumentInput),
    [academy, taxDocumentInput]
  );
  const hasUnsaved = canEdit && currentDigest !== savedDigest;

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
      setSavedDigest(buildStudioSnapshot(academy, ''));
      if (setTaxDocumentInput) setTaxDocumentInput('');
    } catch {
      // Error handled in onSave
    } finally {
      setSaving(false);
    }
  };

  const discardChanges = useCallback(() => {
    try {
      const prev = JSON.parse(savedDigest);
      setAcademy((a) => ({
        ...a,
        name: prev.name,
        phone: prev.phone ? maskPhone(prev.phone) : '',
        email: prev.email,
        address: prev.address,
        quickTimes: prev.quickTimes,
        vertical: prev.vertical,
      }));
      if (setTaxDocumentInput) setTaxDocumentInput('');
      setFieldErrors({});
    } catch {
      void 0;
    }
  }, [savedDigest, setAcademy, setTaxDocumentInput]);

  const applyVerticalChange = (nextVertical) => {
    setAcademy((a) => ({
      ...a,
      vertical: nextVertical === 'physio' ? 'physio' : 'fitness',
    }));
    setPendingVertical(null);
  };

  const verticalLabel =
    academy.vertical === 'physio' ? 'Fisioterapia' : 'Academia / Artes marciais';

  const showFiscalBlock = billingLive && canEdit;
  const quickPreview = formatQuickTimesPreview(academy.quickTimes);

  return (
    <section
      className={`empresa-section estudio-section animate-in${hasUnsaved ? ' estudio-section--dirty' : ''}`}
      style={{ animationDelay: '0.05s' }}
    >
      <div className="finance-settings-group">
        <p className="finance-settings-group__label">Identidade</p>
        <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
          {canEdit ? (
            <div className="settings-form">
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
              />
              <InfoRow icon={<Mail size={16} />} label="E-mail" value={academy.email} />
              <InfoRow icon={<MapPin size={16} />} label="Endereço" value={academy.address} />
            </div>
          )}
        </div>
      </div>

      {showFiscalBlock ? (
        <div className="finance-settings-group">
          <p className="finance-settings-group__label">Faturamento</p>
          <div className="card" style={{ padding: 16 }}>
            {taxUpdateNeeded && setTaxDocumentInput ? (
              <div className="form-group"  id="navi-academy-tax" ref={taxInputRef}>
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
            ) : companyTaxRegistered ? (
              <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0 }}>
                CPF/CNPJ cadastrado · {FISCAL_MASKED}
              </p>
            ) : (
              <p className="text-small text-muted" >
                CPF/CNPJ não cadastrado.
              </p>
            )}
          </div>
        </div>
      ) : null}

      <div className="finance-settings-group">
        <p className="finance-settings-group__label">Operacional</p>
        <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
          {canEdit ? (
            <div className="settings-form">
              <div className="form-group" >
                <label>Tipo de negócio</label>
                <div className="estudio-vertical-alert" role="note">
                  <AlertTriangle size={16} aria-hidden />
                  <span>
                    Altera a terminologia em todo o sistema — ex.: &quot;aluno&quot; vira &quot;paciente&quot; ao
                    escolher Fisioterapia.
                  </span>
                </div>
                <select
                  className="form-input"
                  style={{ maxWidth: 360 }}
                  value={academy.vertical || 'fitness'}
                  onChange={(e) => {
                    const next = e.target.value === 'physio' ? 'physio' : 'fitness';
                    if (next !== (academy.vertical === 'physio' ? 'physio' : 'fitness')) {
                      setPendingVertical(next);
                    }
                  }}
                >
                  <option value="fitness">Academia / Artes marciais</option>
                  <option value="physio">Fisioterapia</option>
                </select>
              </div>
              <div className="form-group" >
                <label>Horários rápidos (reagendar)</label>
                <input
                  className="form-input"
                  value={academy.quickTimes}
                  onChange={(e) => setAcademy({ ...academy, quickTimes: e.target.value })}
                  placeholder="Ex: 18:00, 19:00, 20:00"
                />
                {quickPreview ? (
                  <p className="text-xs text-light" style={{ marginTop: 6 }}>
                    Preview: {quickPreview}
                  </p>
                ) : null}
                <p className="text-xs text-light" style={{ marginTop: 6, lineHeight: 1.45 }}>
                  Separe por vírgulas (formato 24h). Aparecem nos cards de aluno quando há falta no funil.
                </p>
                {fieldErrors.quickTimes ? <FieldError>{fieldErrors.quickTimes}</FieldError> : null}
              </div>
            </div>
          ) : (
            <div className="flex-col gap-2">
              <InfoRow icon={<Tags size={16} />} label="Tipo de negócio" value={verticalLabel} />
              <InfoRow
                icon={<span aria-hidden>⏱️</span>}
                label="Horários rápidos"
                value={quickPreview || academy.quickTimes}
              />
            </div>
          )}
        </div>
      </div>

      <SettingsStickySave
        visible={hasUnsaved}
        saving={saving}
        onSave={handleSave}
        onDiscard={discardChanges}
      />

      <ConfirmDialog
        open={pendingVertical != null}
        title="Alterar tipo de negócio?"
        description="A terminologia do sistema inteiro será atualizada (menus, rótulos e textos). Essa ação afeta todos os usuários da academia."
        confirmLabel="Alterar"
        onConfirm={() => applyVerticalChange(pendingVertical)}
        onClose={() => setPendingVertical(null)}
      />

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .estudio-section--dirty {
          padding-bottom: calc(var(--space-12) + 56px);
        }
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
        .academy-field-add-link:hover { text-decoration: underline; }
        .info-row { flex-wrap: wrap; }
        .info-row-action { margin-left: auto; flex-shrink: 0; }
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
      `,
        }}
      />
    </section>
  );
};

export default EstudioSection;
