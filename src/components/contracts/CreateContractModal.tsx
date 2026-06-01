import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { X, Plus, Trash2, FileText, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import ContractSignerDeliveryPicker, {
  isEmailDelivery,
  isWhatsAppDelivery,
} from './ContractSignerDeliveryPicker.js';
import {
  createContractSchema,
  defaultSigner,
  ACTION_OPTIONS,
  type CreateContractFormValues,
} from './contractsSchema.js';
import { useCreateContract, useContractTemplates, useContractAutentiqueMeta } from '../../features/contracts/queries.js';
import { previewContractRequest } from '../../features/contracts/api.js';
import {
  resolveTemplateIdForPlan,
  type ContractTemplatePurpose,
} from '../../features/contracts/templatesApi.js';
import { templatesForPurpose } from '../../lib/contractPlanTemplates.js';
import {
  countEnabledSignerSlots,
  type ContractSignerLayout,
} from '../../../lib/contracts/contractSignerLayout.js';
import {
  describeSignerDelivery,
  diagnoseContractSend,
} from '../../../lib/contracts/contractSendDiagnostics.js';
import {
  buildPrimarySignerFromLead,
  formatEmailForSignerField,
  formatPhoneForSignerField,
  phoneAutentiquePreview,
} from '../../lib/contractSignerContact.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import { isInactiveStudent } from '../../lib/studentStatus.js';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import FieldError from '../shared/FieldError.jsx';
import {
  resolveAcademyContactEmail,
  patchAcademyEmailInList,
} from '../../lib/academyContactEmail.js';
import { saveAcademySettingsApi } from '../../lib/academySettingsApi.js';
import { invalidateAcademyDocumentCache } from '../../lib/getAcademyDocument.js';
import { buildAutentiqueDocumentName } from '../../../lib/contracts/buildAutentiqueDocumentMeta.js';
import {
  contratadaSlotEnabled,
  signerEmailsMatchContratadaForAutoSign,
} from '../../../lib/contracts/autentiqueAutoSign.js';

type Step = 'template' | 'signers' | 'send';

interface CreateContractModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  leadId?: string;
  /** Matrícula (padrão) ou termo de rescisão. */
  purpose?: ContractTemplatePurpose;
  /** Permite envio para aluno desligado (ex.: rescisão após desligamento). */
  allowInactiveStudent?: boolean;
  /** Dados de desligamento recém-salvos (antes do refresh do cadastro). */
  leadOverrides?: { exitDate?: string; exitReason?: string };
}

export default function CreateContractModal({
  open,
  onClose,
  onSuccess,
  leadId,
  purpose = 'enrollment',
  allowInactiveStudent = false,
  leadOverrides,
}: CreateContractModalProps) {
  const [formError, setFormError] = React.useState('');
  const [step, setStep] = useState<Step>('template');
  const [showOptionalName, setShowOptionalName] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateContract();
  const { data: templatesData, isLoading: templatesLoading } = useContractTemplates(true);
  const allTemplates = templatesData?.templates || [];
  const templates = useMemo(
    () => templatesForPurpose(allTemplates, purpose),
    [allTemplates, purpose]
  );
  const templatesConfigured = templatesData?.configured !== false;
  const isRescission = purpose === 'rescission';
  const leads = useLeadStore((s) => s.leads);
  const students = useStudentStore((s) => s.students);
  const fetchStudentById = useStudentStore((s) => s.fetchStudentById);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);
  const canEditAcademyEmail = navRole === 'owner' || navRole === 'admin';

  const [academyContactEmail, setAcademyContactEmail] = useState('');
  const [inlineAcademyEmail, setInlineAcademyEmail] = useState('');
  const [savingAcademyEmail, setSavingAcademyEmail] = useState(false);
  const [autoSignAcademy, setAutoSignAcademy] = useState(false);
  const { data: autentiqueMeta } = useContractAutentiqueMeta(open);

  const lead = useMemo(() => {
    const id = String(leadId || '');
    if (!id) return null;
    const fromLeads = (leads || []).find((l) => String(l.id) === id);
    const base = fromLeads || (students || []).find((s) => String(s.id) === id) || null;
    if (!base) return null;
    if (!leadOverrides) return base;
    return {
      ...base,
      ...(leadOverrides.exitDate != null ? { exitDate: leadOverrides.exitDate } : {}),
      ...(leadOverrides.exitReason != null ? { exitReason: leadOverrides.exitReason } : {}),
    };
  }, [leadId, leads, students, leadOverrides]);
  const studentInactive = lead ? isInactiveStudent(lead) : false;
  const blockInactive = studentInactive && !allowInactiveStudent && !isRescission;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<CreateContractFormValues>({
    defaultValues: {
      name: '',
      sandbox: false,
      signers: [defaultSigner()],
      templateId: '',
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'signers' });
  const sandbox = watch('sandbox');
  const templateId = watch('templateId');
  const signers = watch('signers');

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.$id === templateId) || null,
    [templates, templateId]
  );

  const layoutForAutoSign = selectedTemplate?.signerLayout as ContractSignerLayout | undefined;
  const showAutoSignOption = contratadaSlotEnabled(layoutForAutoSign);
  const canAutoSignAcademy = useMemo(
    () =>
      Boolean(
        autentiqueMeta?.configured &&
          autentiqueMeta.accountEmail &&
          showAutoSignOption &&
          signerEmailsMatchContratadaForAutoSign(
            (signers || []).map((s) => ({
              name: s?.name,
              email: s?.email,
              phone: s?.phone,
              action: s?.action,
              delivery_method: s?.delivery_method,
            })),
            layoutForAutoSign,
            autentiqueMeta.accountEmail || ''
          )
      ),
    [autentiqueMeta, showAutoSignOption, signers, layoutForAutoSign]
  );

  useEffect(() => {
    if (!open) {
      setAutoSignAcademy(false);
      return;
    }
    if (canAutoSignAcademy) setAutoSignAcademy(true);
  }, [open, canAutoSignAcademy]);

  const requiredSignerCount = useMemo(() => {
    const layout = selectedTemplate?.signerLayout as ContractSignerLayout | undefined;
    const count = countEnabledSignerSlots(layout);
    return count > 0 ? count : 1;
  }, [selectedTemplate]);

  const buildSignersForTemplate = useCallback(
    (template: (typeof templates)[number] | null | undefined) => {
      const layout = template?.signerLayout as ContractSignerLayout | undefined;
      const slots = layout?.slots || [];
      const signerCount = countEnabledSignerSlots(layout) || 1;

      const primary = lead
        ? (buildPrimarySignerFromLead(lead) as CreateContractFormValues['signers'][number])
        : defaultSigner();

      if (signerCount < 2) return [primary];

      const secondaryLabel = slots[1]?.label || 'Contratada';
      const secondary = {
        name: secondaryLabel.toLowerCase().includes('contratada')
          ? String(academyDoc?.name || 'Academia').trim()
          : '',
        email: String(academyContactEmail || academyDoc?.email || '').trim(),
        phone: '',
        action: 'SIGN' as const,
        delivery_method: 'DELIVERY_METHOD_EMAIL' as const,
      };

      return [primary, { ...secondary, name: secondary.name || secondaryLabel }];
    },
    [academyContactEmail, academyDoc?.email, academyDoc?.name, lead]
  );

  const isContratadaSignerIndex = useCallback(
    (index: number) => {
      const label = String(selectedTemplate?.signerLayout?.slots?.[index]?.label || '').toLowerCase();
      if (label.includes('contratada')) return true;
      if (requiredSignerCount >= 2 && index === 1) return true;
      return false;
    },
    [requiredSignerCount, selectedTemplate?.signerLayout?.slots]
  );

  const saveInlineAcademyEmail = async () => {
    const email = String(inlineAcademyEmail || '').trim();
    if (!email) {
      addToast({ type: 'error', message: 'Informe o e-mail da academia.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      addToast({ type: 'error', message: 'E-mail inválido.' });
      return;
    }
    if (!academyId) return;

    setSavingAcademyEmail(true);
    try {
      if (canEditAcademyEmail) {
        await saveAcademySettingsApi(academyId, { email });
        invalidateAcademyDocumentCache(academyId);
        useLeadStore.getState().setAcademyList(patchAcademyEmailInList(academyList, academyId, email));
      }
      setAcademyContactEmail(email);
      (signers || []).forEach((s, index) => {
        if (!isContratadaSignerIndex(index)) return;
        if (!isEmailDelivery(s?.delivery_method)) return;
        setValue(`signers.${index}.email`, email, { shouldDirty: true, shouldValidate: true });
      });
      addToast({
        type: 'success',
        message: canEditAcademyEmail
          ? 'E-mail da academia salvo e aplicado à contratada.'
          : 'E-mail aplicado à contratada neste envio.',
      });
    } catch (e) {
      addToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Não foi possível salvar o e-mail.',
      });
    } finally {
      setSavingAcademyEmail(false);
    }
  };

  const applyTemplateSelection = useCallback(
    (nextTemplateId: string) => {
      const id = String(nextTemplateId || '').trim();
      setValue('templateId', id, { shouldValidate: true, shouldDirty: true });
      if (!id) return;
      const template = templates.find((t) => t.$id === id) || null;
      replace(buildSignersForTemplate(template));
    },
    [buildSignersForTemplate, replace, setValue, templates]
  );

  const sendDiagnostics = useMemo(
    () =>
      diagnoseContractSend({
        signers: (signers || []).map((s) => ({
          name: s?.name,
          email: s?.email,
          phone: s?.phone,
          action: s?.action,
          delivery_method: s?.delivery_method,
        })),
        layout: selectedTemplate?.signerLayout as ContractSignerLayout | undefined,
      }),
    [signers, selectedTemplate?.signerLayout]
  );

  const deliveryWarnings = useMemo(
    () => [...sendDiagnostics.blockers, ...sendDiagnostics.warnings],
    [sendDiagnostics]
  );

  const openSessionRef = useRef<string | null>(null);
  const lastLeadContactFingerprintRef = useRef('');

  useEffect(() => {
    if (!open) {
      openSessionRef.current = null;
      lastLeadContactFingerprintRef.current = '';
      return;
    }

    const session = `${leadId || ''}:${purpose}`;
    if (openSessionRef.current === session) return;
    openSessionRef.current = session;

    const titlePrefix = isRescission ? 'Termo de rescisão' : 'Contrato';
    const academyName = String(academyDoc?.name || '').trim();
    const baseTitle = lead?.name ? `${titlePrefix} — ${String(lead.name).trim()}` : titlePrefix;
    reset({
      name: buildAutentiqueDocumentName({ academyName, baseName: baseTitle }),
      sandbox: false,
      signers: buildSignersForTemplate(null),
      templateId: '',
    });
    setFormError('');
    setStep('template');
    setShowOptionalName(false);
    setPreviewUrl(null);
    setInlineAcademyEmail('');
  }, [
    open,
    leadId,
    purpose,
    isRescission,
    lead?.name,
    lead?.email,
    lead?.phone,
    academyDoc?.name,
    reset,
    buildSignersForTemplate,
  ]);

  useEffect(() => {
    if (!open || !leadId) return;
    const inStore =
      (leads || []).some((l) => String(l.id) === String(leadId)) ||
      (students || []).some((s) => String(s.id) === String(leadId));
    if (!inStore) void fetchStudentById(leadId);
  }, [open, leadId, leads, students, fetchStudentById]);

  /** Preenche signatário 1 com e-mail/telefone do cadastro (formatados) quando o aluno estiver disponível. */
  useEffect(() => {
    if (!open || !leadId || !lead) return;
    const fingerprint = `${lead.id}|${lead.email || ''}|${lead.phone || ''}|${lead.name || ''}`;
    if (lastLeadContactFingerprintRef.current === fingerprint) return;
    lastLeadContactFingerprintRef.current = fingerprint;

    const primary = buildPrimarySignerFromLead(lead);
    setValue('signers.0.name', primary.name, { shouldDirty: false, shouldValidate: true });
    if (primary.email) {
      setValue('signers.0.email', primary.email, { shouldDirty: false, shouldValidate: true });
    }
    if (primary.phone) {
      setValue('signers.0.phone', primary.phone, { shouldDirty: false, shouldValidate: true });
    }
    setValue('signers.0.delivery_method', primary.delivery_method, {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [open, leadId, lead, setValue]);

  useEffect(() => {
    if (!open || !academyId) return;
    let cancelled = false;
    void resolveAcademyContactEmail(academyId, academyList).then((email) => {
      if (cancelled) return;
      setAcademyContactEmail(email);
      setInlineAcademyEmail(email);
      if (!email) return;
      const currentSigners = getValues('signers') || [];
      currentSigners.forEach((s, index) => {
        if (!isContratadaSignerIndex(index)) return;
        if (!isEmailDelivery(s?.delivery_method)) return;
        if (String(s?.email || '').trim()) return;
        setValue(`signers.${index}.email`, email, { shouldDirty: false, shouldValidate: true });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [open, academyId, academyList, getValues, setValue, isContratadaSignerIndex]);

  useEffect(() => {
    if (!open || templatesLoading) return;
    if (String(getValues('templateId') || '').trim()) return;

    const planName = lead?.plan ? String(lead.plan) : '';
    const suggestedTemplateId =
      templates.length > 0
        ? resolveTemplateIdForPlan(planName, templates, financeConfig?.plans || [], purpose) || ''
        : '';
    if (!suggestedTemplateId) return;

    applyTemplateSelection(suggestedTemplateId);
  }, [
    open,
    templatesLoading,
    templates,
    financeConfig?.plans,
    lead?.plan,
    purpose,
    getValues,
    applyTemplateSelection,
  ]);

  const close = useCallback(() => {
    if (createMutation.isPending) return;
    reset({ name: '', sandbox: false, signers: [defaultSigner()], templateId: '' });
    setFormError('');
    setStep('template');
    setPreviewUrl(null);
    onClose();
  }, [createMutation.isPending, onClose, reset]);

  useModalA11y({ isOpen: open, onClose: close });

  const goNextFromTemplate = async () => {
    const ok = await trigger('templateId');
    if (!ok) return;
    setStep('signers');
  };

  const goNextFromSigners = async () => {
    const ok = await trigger('signers');
    if (!ok) return;
    if (sendDiagnostics.blockers.length) {
      setFormError(sendDiagnostics.blockers.join('\n'));
      return;
    }
    if ((signers || []).length !== requiredSignerCount) {
      setFormError(
        `Este modelo exige ${requiredSignerCount} signatário(s). Ajuste a lista antes de continuar.`
      );
      return;
    }
    setFormError('');
    setStep('send');
  };

  const loadPreview = async () => {
    const parsed = createContractSchema.safeParse(watch());
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Verifique os campos');
      return;
    }
    setPreviewLoading(true);
    setPreviewUrl(null);
    try {
      const res = await previewContractRequest({
        name: parsed.data.name || 'Prévia',
        signers: parsed.data.signers.map((s) => ({
          name: s.name,
          email: s.email?.trim() || undefined,
          phone: s.phone?.trim() || undefined,
          action: s.action,
          delivery_method: s.delivery_method,
        })),
        templateId: parsed.data.templateId,
        leadId,
      });
      if (res.pdfBase64) {
        setPreviewUrl(`data:application/pdf;base64,${res.pdfBase64}`);
      }
    } catch (e) {
      addToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Falha ao gerar prévia',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const preSubmit = diagnoseContractSend({
      signers: (values.signers || []).map((s) => ({
        name: s.name,
        email: s.email,
        phone: s.phone,
        action: s.action,
        delivery_method: s.delivery_method,
      })),
      layout: selectedTemplate?.signerLayout as ContractSignerLayout | undefined,
    });
    if (preSubmit.blockers.length) {
      setFormError(preSubmit.blockers.join('\n'));
      return;
    }

    const parsed = createContractSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFormError(first?.message || 'Verifique os campos');
      return;
    }

    const academyName = String(academyDoc?.name || '').trim();
    const titlePrefix = isRescission ? 'Termo de rescisão' : 'Contrato';
    const baseTitle =
      String(parsed.data.name || '').trim() ||
      (lead?.name ? `${titlePrefix} — ${String(lead.name).trim()}` : '') ||
      `${titlePrefix} ${new Date().toLocaleDateString('pt-BR')}`;
    const contractName = buildAutentiqueDocumentName({ academyName, baseName: baseTitle });

    try {
      const result = await createMutation.mutateAsync({
        name: contractName,
        signers: parsed.data.signers.map((s) => ({
          name: s.name,
          email: s.email?.trim() || undefined,
          phone: s.phone?.trim() || undefined,
          action: s.action,
          delivery_method: s.delivery_method,
        })),
        templateId: parsed.data.templateId,
        sandbox: navRole === 'owner' ? parsed.data.sandbox : false,
        leadId,
        contractPurpose: purpose,
        autoSignAcademy: autoSignAcademy && canAutoSignAcademy,
      });
      const appliedAutoSign = Boolean(autoSignAcademy && canAutoSignAcademy && result.autoSign?.applied);
      const successMsg = isRescission
        ? appliedAutoSign
          ? 'Termo enviado. Academia assinou automaticamente; aguardando o aluno.'
          : 'Termo de rescisão enviado para assinatura.'
        : appliedAutoSign
          ? 'Contrato enviado. Academia assinou automaticamente; aguardando o aluno.'
          : 'Contrato enviado para assinatura.';
      addToast({ type: 'success', message: successMsg });
      if (result.warning) {
        addToast({ type: 'warning', message: result.warning });
      }
      onSuccess?.();
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao criar contrato';
      setFormError(msg);
      addToast({ type: 'error', message: msg });
    }
  });

  if (!open || typeof document === 'undefined') return null;

  const stepLabels: Record<Step, string> = {
    template: '1. Modelo',
    signers: '2. Signatários',
    send: '3. Enviar',
  };

  return createPortal(
    <div className="contracts-modal-backdrop" role="presentation" onClick={close}>
      <div
        className="contracts-modal card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-contract-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="contracts-modal-header">
          <div>
            <h2 id="create-contract-title" className="navi-section-heading contracts-modal-title">
              {isRescission ? 'Termo de rescisão' : 'Novo contrato'}
            </h2>
            <p className="text-small text-muted contracts-modal-steps">
              {stepLabels.template} → {stepLabels.signers} → {stepLabels.send}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {blockInactive ? (
          <p className="contracts-form-error contracts-modal-inactive">
            Aluno desligado ou inativo — não é possível enviar novo contrato.
          </p>
        ) : null}

        <form className="contracts-modal-body" onSubmit={onSubmit} noValidate>
          {step === 'template' ? (
            <div className="contracts-form-block">
              <span className="task-field-label">
                {isRescission ? 'Modelo do termo de rescisão' : 'Modelo de contrato'}
              </span>
              {templatesLoading ? (
                <p className="text-small text-muted">Carregando modelos…</p>
              ) : !templatesConfigured ? (
                <p className="text-small text-muted">
                  Modelos não configurados no servidor. Peça ao administrador para definir as variáveis de
                  ambiente.
                </p>
              ) : templates.length === 0 ? (
                <div className="card contracts-empty-templates">
                  <p className="text-small">
                    {isRescission
                      ? 'Nenhum modelo de rescisão ativo. Crie um modelo com finalidade "Rescisão" e vincule-o ao plano em Financeiro → Planos.'
                      : 'Nenhum modelo cadastrado.'}
                    {navRole === 'owner' ? (
                      <>
                        {' '}
                        <Link to="/empresa?tab=financeiro&section=contratos&new=1">Criar modelo no editor</Link>
                      </>
                    ) : (
                      ' Peça ao proprietário da academia para criar um modelo.'
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <select
                    className="form-input"
                    value={templateId || ''}
                    onChange={(e) => applyTemplateSelection(e.target.value)}
                  >
                    <option value="">Selecione um modelo…</option>
                    {templates.map((t) => (
                      <option key={t.$id} value={t.$id}>
                        {t.name}
                        {t.isDefault ? ' (padrão)' : ''}
                      </option>
                    ))}
                  </select>
                  {navRole === 'owner' ? (
                    <p className="text-small text-muted contracts-template-link">
                      <Link to="/empresa?tab=financeiro&section=contratos">Gerenciar modelos</Link>
                    </p>
                  ) : null}
                </>
              )}
              {errors.templateId ? (
                <FieldError>{errors.templateId.message}</FieldError>
              ) : null}
            </div>
          ) : null}

          {step === 'signers' ? (
            <>
              <div className="contracts-autentique-help card">
                <p className="text-small contracts-autentique-help-text">
                  <strong>Como funciona:</strong> escolha <strong>E-mail</strong> ou <strong>WhatsApp</strong> para
                  cada signatário. A Autentique envia o link automaticamente — a pessoa assina na plataforma deles,
                  não dentro do Nave.{' '}
                  <strong>Cada signatário por e-mail precisa de um endereço diferente</strong> (ex.: e-mail do aluno e
                  e-mail da academia — não use o mesmo nos dois).
                </p>
              </div>

              {deliveryWarnings.length > 0 ? (
                <div className="contracts-email-warning" role="alert">
                  <AlertTriangle size={16} aria-hidden />
                  <span>{deliveryWarnings.join(' ')}</span>
                </div>
              ) : null}

              <div className="contracts-form-block">
                <div className="contracts-signers-head">
                  <span className="task-field-label contracts-signers-label">Revisar signatários</span>
                  <button
                    type="button"
                    className="btn-outline contracts-add-signer"
                    onClick={() => append(defaultSigner())}
                    disabled={(signers || []).length >= requiredSignerCount}
                  >
                    <Plus size={14} /> Adicionar signatário
                  </button>
                </div>

                <p className="text-small text-muted">
                  Este modelo usa {requiredSignerCount} signatário(s)
                  {selectedTemplate?.signerLayout?.slots
                    ?.filter((s) => s.enabled !== false)
                    .map((slot, i) => ` · ${i + 1}: ${slot.label}`)
                    .join('') || ''}
                  .
                </p>

                {fields.map((field, index) => {
                  const deliveryMethod = watch(`signers.${index}.delivery_method`);
                  const whatsapp = isWhatsAppDelivery(deliveryMethod);
                  const email = isEmailDelivery(deliveryMethod);

                  return (
                  <div key={field.id} className="contracts-signer-card">
                    <div className="contracts-signer-card-head">
                      <FileText size={16} aria-hidden />
                      <span>
                        Signatário {index + 1}
                        {selectedTemplate?.signerLayout?.slots?.[index]?.label
                          ? ` · ${selectedTemplate.signerLayout.slots[index].label}`
                          : ''}
                      </span>
                      {fields.length > 1 ? (
                        <button
                          type="button"
                          className="contracts-remove-signer"
                          onClick={() => remove(index)}
                          aria-label="Remover signatário"
                        >
                          <Trash2 size={14} />
                        </button>
                      ) : null}
                    </div>
                    <div className="contracts-signer-grid">
                      <div className="contracts-signer-grid__full">
                        <label className="task-field-label">Nome</label>
                        <input className="form-input" {...register(`signers.${index}.name`)} />
                        {errors.signers?.[index]?.name ? (
                          <FieldError>{errors.signers[index]?.name?.message}</FieldError>
                        ) : null}
                      </div>

                      <div className="contracts-signer-grid__full">
                        <ContractSignerDeliveryPicker
                          value={deliveryMethod}
                          onChange={(method) => {
                            setValue(`signers.${index}.delivery_method`, method, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                            if (index === 0 && lead) {
                              if (
                                isWhatsAppDelivery(method) &&
                                !String(getValues(`signers.${index}.phone`) || '').trim()
                              ) {
                                const fromLead = formatPhoneForSignerField(lead.phone);
                                if (fromLead) {
                                  setValue(`signers.${index}.phone`, fromLead, {
                                    shouldDirty: false,
                                    shouldValidate: true,
                                  });
                                }
                              }
                              if (
                                isEmailDelivery(method) &&
                                !String(getValues(`signers.${index}.email`) || '').trim()
                              ) {
                                const fromLead = formatEmailForSignerField(lead.email);
                                if (fromLead) {
                                  setValue(`signers.${index}.email`, fromLead, {
                                    shouldDirty: false,
                                    shouldValidate: true,
                                  });
                                }
                              }
                            }
                            void trigger(`signers.${index}`);
                          }}
                        />
                      </div>

                      {whatsapp ? (
                        <div className="contracts-signer-grid__full">
                          <label className="task-field-label">WhatsApp</label>
                          <input
                            className="form-input"
                            {...register(`signers.${index}.phone`, {
                              onChange: (e) => {
                                setValue(`signers.${index}.phone`, formatPhoneForSignerField(e.target.value), {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              },
                            })}
                            placeholder="(19) 99999-9999"
                            inputMode="tel"
                          />
                          {errors.signers?.[index]?.phone ? (
                            <FieldError>{errors.signers[index]?.phone?.message}</FieldError>
                          ) : (
                            <p className="text-small text-muted contracts-signer-field-hint">
                              A Autentique envia o link só neste número — não usa o e-mail abaixo. Celular com DDD
                              e 9 na frente (11 dígitos).
                              {phoneAutentiquePreview(watch(`signers.${index}.phone`)) ? (
                                <>
                                  {' '}
                                  Será enviado como{' '}
                                  <strong>{phoneAutentiquePreview(watch(`signers.${index}.phone`))}</strong>.
                                </>
                              ) : null}
                            </p>
                          )}
                        </div>
                      ) : null}

                      {email ? (
                        <div className="contracts-signer-grid__full">
                          <label className="task-field-label">E-mail</label>
                          <input
                            className="form-input"
                            type="email"
                            {...register(`signers.${index}.email`, {
                              onChange: (e) => {
                                setValue(
                                  `signers.${index}.email`,
                                  formatEmailForSignerField(e.target.value),
                                  { shouldDirty: true, shouldValidate: true }
                                );
                              },
                            })}
                            placeholder="nome@email.com"
                          />
                          {errors.signers?.[index]?.email ? (
                            <FieldError>{errors.signers[index]?.email?.message}</FieldError>
                          ) : (
                            <p className="text-small text-muted contracts-signer-field-hint">
                              A Autentique envia o link para esta caixa de entrada.
                              {index === 0 && lead?.email ? ' Preenchido do cadastro do aluno.' : ''}
                            </p>
                          )}
                          {isContratadaSignerIndex(index) &&
                          !String(signers?.[index]?.email || '').trim() &&
                          !academyContactEmail ? (
                            <div className="contracts-academy-email-inline card">
                              <p className="text-small contracts-academy-email-inline__text">
                                O e-mail da contratada (academia) ainda não está no cadastro. Informe abaixo
                                {canEditAcademyEmail
                                  ? ' para salvar na academia e usar nos próximos contratos.'
                                  : ' para este envio.'}
                              </p>
                              <div className="contracts-academy-email-inline__row">
                                <input
                                  className="form-input"
                                  type="email"
                                  value={inlineAcademyEmail}
                                  onChange={(e) => setInlineAcademyEmail(e.target.value)}
                                  placeholder="contato@academia.com"
                                  disabled={savingAcademyEmail}
                                />
                                <button
                                  type="button"
                                  className="btn-outline"
                                  onClick={() => void saveInlineAcademyEmail()}
                                  disabled={savingAcademyEmail}
                                >
                                  {savingAcademyEmail ? 'Salvando…' : 'Aplicar'}
                                </button>
                              </div>
                              {canEditAcademyEmail ? null : (
                                <p className="text-small text-muted">
                                  Apenas o titular ou administrador pode alterar o cadastro da academia em{' '}
                                  <Link to="/empresa?tab=estudio">Configurações</Link>.
                                </p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {whatsapp ? (
                        <div>
                          <label className="task-field-label">E-mail (opcional)</label>
                          <input
                            className="form-input"
                            type="email"
                            {...register(`signers.${index}.email`, {
                              onChange: (e) => {
                                setValue(
                                  `signers.${index}.email`,
                                  formatEmailForSignerField(e.target.value),
                                  { shouldDirty: true, shouldValidate: true }
                                );
                              },
                            })}
                            placeholder="Opcional"
                          />
                        </div>
                      ) : null}

                      {email ? (
                        <div>
                          <label className="task-field-label">Telefone (opcional)</label>
                          <input
                            className="form-input"
                            {...register(`signers.${index}.phone`, {
                              onChange: (e) => {
                                setValue(`signers.${index}.phone`, formatPhoneForSignerField(e.target.value), {
                                  shouldDirty: true,
                                  shouldValidate: true,
                                });
                              },
                            })}
                            placeholder="(19) 99999-9999"
                            inputMode="tel"
                          />
                          {index === 0 && phoneAutentiquePreview(watch(`signers.${index}.phone`)) ? (
                            <p className="text-small text-muted contracts-signer-field-hint">
                              Se trocar para WhatsApp depois, será enviado como{' '}
                              <strong>{phoneAutentiquePreview(watch(`signers.${index}.phone`))}</strong>.
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      <div>
                        <label className="task-field-label">Tipo de assinatura</label>
                        <select className="form-input" {...register(`signers.${index}.action`)}>
                          {ACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                );
                })}
              </div>
            </>
          ) : null}

          {step === 'send' ? (
            <>
              <div className="contracts-send-summary card">
                <p className="task-field-label contracts-send-summary__title">Resumo do envio</p>
                <ul className="contracts-send-summary__list text-small">
                  {(signers || []).map((s, index) => {
                    const slotLabel =
                      selectedTemplate?.signerLayout?.slots?.[index]?.label ||
                      `Signatário ${index + 1}`;
                    return (
                      <li key={`summary-${index}`}>
                        <strong>{slotLabel}</strong> — {String(s?.name || 'Sem nome').trim()} ·{' '}
                        {describeSignerDelivery({
                          name: s?.name,
                          email: s?.email,
                          phone: s?.phone,
                          delivery_method: s?.delivery_method,
                          action: s?.action,
                        })}
                      </li>
                    );
                  })}
                </ul>
                {academyDoc?.name ? (
                  <p className="text-small text-muted contracts-send-summary__autentique-hint">
                    Na Autentique, o documento aparecerá como{' '}
                    <strong>{buildAutentiqueDocumentName({
                      academyName: String(academyDoc.name).trim(),
                      baseName: watch('name') || (isRescission ? 'Termo de rescisão' : 'Contrato'),
                    })}</strong>
                    , com mensagem informando que o envio é da academia. O criador no painel
                    Autentique segue sendo a conta vinculada à integração.
                  </p>
                ) : null}
                {showAutoSignOption ? (
                  <div className="contracts-auto-sign-option">
                    <label className="contracts-auto-sign-option__label">
                      <input
                        type="checkbox"
                        checked={autoSignAcademy && canAutoSignAcademy}
                        disabled={!canAutoSignAcademy || createMutation.isPending}
                        onChange={(e) => setAutoSignAcademy(e.target.checked)}
                      />
                      <span>
                        <strong>Assinar pela academia agora</strong>
                        <span className="text-small text-muted contracts-auto-sign-option__hint">
                          {canAutoSignAcademy
                            ? 'A contratada será assinada automaticamente pela conta Autentique. Só o aluno receberá o link.'
                            : autentiqueMeta?.configured
                              ? `Use o e-mail ${autentiqueMeta.accountEmailMasked || 'da conta Autentique'} no signatário Contratada (ou configure AUTENTIQUE_ACCOUNT_EMAIL no servidor).`
                              : 'Configure AUTENTIQUE_ACCOUNT_EMAIL no servidor com o e-mail da conta Autentique do token.'}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}
                {sendDiagnostics.warnings.length > 0 ? (
                  <p className="text-small contracts-send-summary__warn">
                    {sendDiagnostics.warnings.join(' ')}
                  </p>
                ) : null}
              </div>

              <details
                className="contracts-optional-name"
                open={showOptionalName}
                onToggle={(e) => setShowOptionalName((e.target as HTMLDetailsElement).open)}
              >
                <summary className="task-field-label">Nome do contrato (opcional)</summary>
                <input
                  id="contract-name"
                  className="form-input"
                  {...register('name')}
                  placeholder="Ex.: Contrato de matrícula — João Silva"
                />
                {errors.name ? <FieldError>{errors.name.message}</FieldError> : null}
              </details>

              <div className="contracts-preview-block">
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => void loadPreview()}
                  disabled={previewLoading}
                >
                  {previewLoading ? 'Gerando prévia…' : 'Ver prévia do PDF'}
                </button>
                {previewUrl ? (
                  <iframe
                    title="Prévia do contrato"
                    className="contracts-preview-iframe"
                    src={previewUrl}
                  />
                ) : null}
              </div>

              {navRole === 'owner' ? (
                <label className="contracts-sandbox">
                  <input type="checkbox" {...register('sandbox')} checked={sandbox} />
                  <span>Modo sandbox (teste — não consome créditos)</span>
                </label>
              ) : null}
            </>
          ) : null}

          {formError ? <p className="contracts-form-error">{formError}</p> : null}

          <div className="contracts-modal-footer">
            {step !== 'template' ? (
              <button
                type="button"
                className="btn-outline"
                onClick={() => setStep(step === 'send' ? 'signers' : 'template')}
                disabled={createMutation.isPending}
              >
                <ChevronLeft size={14} />
                Voltar
              </button>
            ) : (
              <button type="button" className="btn-outline" onClick={close} disabled={createMutation.isPending}>
                Cancelar
              </button>
            )}

            {step === 'template' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void goNextFromTemplate()}
                disabled={templates.length === 0 || blockInactive}
              >
                Próximo
                <ChevronRight size={14} />
              </button>
            ) : null}

            {step === 'signers' ? (
              <button
                type="button"
                className="btn-primary"
                onClick={() => void goNextFromSigners()}
                disabled={blockInactive}
              >
                Revisar envio
                <ChevronRight size={14} />
              </button>
            ) : null}

            {step === 'send' ? (
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending || templates.length === 0 || blockInactive}
              >
                {createMutation.isPending ? 'Enviando…' : 'Enviar para assinatura'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
