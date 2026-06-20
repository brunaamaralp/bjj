import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Building2, Phone, Mail, MapPin, Tags, AlertTriangle } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { useTerms } from '../../lib/terminology.js';
import FieldError from '../shared/FieldError.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import SettingsStickySave from '../shared/settings/SettingsStickySave.jsx';
import { maskPhone, maskCPFOrCNPJ } from '../../lib/masks.js';
import { useAcademyTabSection } from '../../lib/academyTabSection.js';
import {
  ESTUDIO_SETTINGS_ITEMS,
  ESTUDIO_SETTINGS_SECTIONS,
  ESTUDIO_DEFAULT_SECTION,
  isEstudioSettingsSection,
} from '../../lib/estudioSettingsSections.js';
import { readSocialLinks, mergeSocialLinksIntoSettings } from '../../lib/socialLinksConfig.js';
import { friendlyError } from '../../lib/errorMessages';
import AcademyTabSettingsLayout from './settings/AcademyTabSettingsLayout.jsx';
import '../finance/finance.css';

const FISCAL_MASKED = '•••.•••.•••-••';

const SECTION_META = Object.fromEntries(ESTUDIO_SETTINGS_ITEMS.map((item) => [item.id, item]));

function buildStudioSnapshot(academy, taxDocumentInput, socialLinks) {
  return JSON.stringify({
    name: String(academy?.name || '').trim(),
    phone: String(academy?.phone || '').replace(/\D/g, ''),
    email: String(academy?.email || '').trim(),
    address: String(academy?.address || '').trim(),
    quickTimes: String(academy?.quickTimes || '').trim(),
    vertical: academy?.vertical === 'physio' ? 'physio' : 'fitness',
    taxDocumentInput: String(taxDocumentInput || '').trim(),
    socialLinks,
  });
}

function formatQuickTimesPreview(input) {
  const parts = String(input || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : '';
}

const InfoRow = ({ icon, label, value }) => (
  <div className="info-row">
    <span className="info-row-icon">{icon}</span>
    <span className="info-row-label">{label}</span>
    {value ? (
      <span className="info-row-value">{value}</span>
    ) : (
      <span className="info-row-empty">Não informado</span>
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
  academyId,
  academyDataVersion = 0,
  tabId = 'estudio',
}) => {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const canEdit = role === 'owner';
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [pendingVertical, setPendingVertical] = useState(null);
  const [socialSaving, setSocialSaving] = useState(false);
  const didAutoFocusTax = useRef(false);

  const socialLinks = useMemo(() => readSocialLinks(academy.settings), [academy.settings]);
  const [socialDraft, setSocialDraft] = useState(socialLinks);

  useEffect(() => {
    setSocialDraft(readSocialLinks(academy.settings));
  }, [academy.settings, academyDataVersion]);

  const { section, goSection } = useAcademyTabSection(
    tabId,
    ESTUDIO_DEFAULT_SECTION,
    isEstudioSettingsSection
  );

  const [savedDigest, setSavedDigest] = useState(() =>
    buildStudioSnapshot(academy, taxDocumentInput, socialLinks)
  );

  useEffect(() => {
    setSavedDigest(buildStudioSnapshot(academy, '', readSocialLinks(academy.settings)));
    setFieldErrors({});
  }, [academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoEditTax && taxUpdateNeeded && canEdit && section === ESTUDIO_SETTINGS_SECTIONS.DADOS) {
      if (!didAutoFocusTax.current) {
        didAutoFocusTax.current = true;
        const t = window.setTimeout(() => {
          taxInputRef?.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
          taxInputRef?.current?.focus?.();
        }, 120);
        return () => window.clearTimeout(t);
      }
    }
    return undefined;
  }, [autoEditTax, taxUpdateNeeded, canEdit, taxInputRef, section]);

  const currentDigest = useMemo(
    () => buildStudioSnapshot(academy, taxDocumentInput, socialDraft),
    [academy, taxDocumentInput, socialDraft]
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
      if (academyId && section === ESTUDIO_SETTINGS_SECTIONS.REDES) {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const mergedSettings = mergeSocialLinksIntoSettings(doc.settings, socialDraft);
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          settings: JSON.stringify(mergedSettings),
        });
        setAcademy((a) => ({ ...a, settings: JSON.stringify(mergedSettings) }));
      }

      await onSave({
        successMessage:
          section === ESTUDIO_SETTINGS_SECTIONS.REDES
            ? 'Redes sociais salvas.'
            : `Dados da ${terms.workspaceNoun} salvos.`,
      });
      setSavedDigest(buildStudioSnapshot(academy, '', socialDraft));
      if (setTaxDocumentInput) setTaxDocumentInput('');
    } catch {
      void 0;
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
      setSocialDraft(prev.socialLinks || readSocialLinks(academy.settings));
      if (setTaxDocumentInput) setTaxDocumentInput('');
      setFieldErrors({});
    } catch {
      void 0;
    }
  }, [savedDigest, setAcademy, setTaxDocumentInput, academy.settings]);

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
  const meta = SECTION_META[section];

  const saveSocialOnly = async () => {
    if (!academyId || !canEdit) return;
    setSocialSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const mergedSettings = mergeSocialLinksIntoSettings(doc.settings, socialDraft);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(mergedSettings),
      });
      setAcademy((a) => ({ ...a, settings: JSON.stringify(mergedSettings) }));
      setSavedDigest(
        buildStudioSnapshot(
          { ...academy, settings: JSON.stringify(mergedSettings) },
          taxDocumentInput,
          socialDraft
        )
      );
      addToast({ type: 'success', message: 'Redes sociais salvas.' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSocialSaving(false);
    }
  };

  const socialDirty =
    JSON.stringify(socialDraft) !== JSON.stringify(readSocialLinks(academy.settings));

  let sectionBody = null;

  if (section === ESTUDIO_SETTINGS_SECTIONS.DADOS) {
    sectionBody = (
      <div className="finance-settings-section-body">
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
              {showFiscalBlock ? (
                <div className="form-group" id="navi-academy-tax" ref={taxInputRef}>
                  <label>CPF ou CNPJ (nota fiscal)</label>
                  {taxUpdateNeeded && setTaxDocumentInput ? (
                    <>
                      <input
                        className="form-input"
                        type="text"
                        inputMode="numeric"
                        value={taxDocumentInput}
                        onChange={(e) => setTaxDocumentInput(maskCPFOrCNPJ(e.target.value))}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        autoComplete="off"
                        maxLength={20}
                      />
                      <p className="text-xs text-light" style={{ marginTop: 6 }}>
                        Usado na cobrança. Se já informou ao assinar, pode ignorar.
                      </p>
                    </>
                  ) : companyTaxRegistered ? (
                    <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                      CPF/CNPJ cadastrado · {FISCAL_MASKED}
                    </p>
                  ) : (
                    <p className="text-small text-muted" style={{ margin: '6px 0 0' }}>
                      CPF/CNPJ não cadastrado.
                    </p>
                  )}
                </div>
              ) : null}
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
            </div>
          )}
        </div>
      </div>
    );
  } else if (section === ESTUDIO_SETTINGS_SECTIONS.ENDERECO) {
    sectionBody = (
      <div className="finance-settings-section-body">
        <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
          {canEdit ? (
            <div className="settings-form">
              <div className="form-group">
                <label>Endereço completo</label>
                <input
                  className="form-input"
                  value={academy.address}
                  onChange={(e) => setAcademy({ ...academy, address: e.target.value })}
                  placeholder="Rua, número, bairro, cidade"
                />
              </div>
            </div>
          ) : (
            <InfoRow icon={<MapPin size={16} />} label="Endereço" value={academy.address} />
          )}
        </div>
      </div>
    );
  } else if (section === ESTUDIO_SETTINGS_SECTIONS.REDES) {
    sectionBody = (
      <div className="finance-settings-section-body">
        <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
          {canEdit ? (
            <div className="settings-form">
              {[
                { key: 'instagram', label: 'Instagram', placeholder: '@suaacademia ou URL' },
                { key: 'facebook', label: 'Facebook', placeholder: 'URL da página' },
                { key: 'website', label: 'Site', placeholder: 'https://…' },
                { key: 'whatsapp', label: 'WhatsApp (link)', placeholder: 'https://wa.me/…' },
              ].map(({ key, label, placeholder }) => (
                <div className="form-group" key={key}>
                  <label>{label}</label>
                  <input
                    className="form-input"
                    value={socialDraft[key]}
                    onChange={(e) => setSocialDraft((s) => ({ ...s, [key]: e.target.value }))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn-primary"
                disabled={socialSaving || !socialDirty}
                onClick={() => void saveSocialOnly()}
              >
                {socialSaving ? 'Salvando…' : 'Salvar redes sociais'}
              </button>
            </div>
          ) : (
            <div className="flex-col gap-2">
              {Object.entries(socialLinks).map(([key, value]) =>
                value ? (
                  <InfoRow key={key} icon={<span aria-hidden>🔗</span>} label={key} value={value} />
                ) : null
              )}
            </div>
          )}
        </div>
      </div>
    );
  } else if (section === ESTUDIO_SETTINGS_SECTIONS.PERSONALIZACAO) {
    sectionBody = (
      <div className="finance-settings-section-body">
        <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
          {canEdit ? (
            <div className="settings-form">
              <div className="form-group">
                <label>Tipo de negócio</label>
                <div className="estudio-vertical-alert" role="note">
                  <AlertTriangle size={16} aria-hidden />
                  <span>
                    Altera a terminologia em todo o sistema — ex.: &quot;aluno&quot; vira &quot;paciente&quot;
                    ao escolher Fisioterapia.
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
              <div className="form-group">
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
    );
  }

  const stickyVisible =
    canEdit &&
    hasUnsaved &&
    section !== ESTUDIO_SETTINGS_SECTIONS.REDES &&
    section !== ESTUDIO_SETTINGS_SECTIONS.PERSONALIZACAO;

  return (
    <section
      className={`empresa-section estudio-section animate-in${hasUnsaved ? ' estudio-section--dirty' : ''}`}
    >
      <AcademyTabSettingsLayout
        navLabel="Seções do estúdio"
        items={ESTUDIO_SETTINGS_ITEMS}
        activeId={section}
        onSelect={goSection}
        title={meta?.label}
        subtitle={meta?.hint}
      >
        {sectionBody}
      </AcademyTabSettingsLayout>

      <SettingsStickySave
        visible={stickyVisible}
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
