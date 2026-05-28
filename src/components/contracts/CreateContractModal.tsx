import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { X, Plus, Trash2, FileText, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import {
  createContractSchema,
  defaultSigner,
  ACTION_OPTIONS,
  DELIVERY_OPTIONS,
  type CreateContractFormValues,
} from './contractsSchema.js';
import { useCreateContract, useContractTemplates } from '../../features/contracts/queries.js';
import { previewContractRequest } from '../../features/contracts/api.js';
import { resolveTemplateIdForPlan } from '../../features/contracts/templatesApi.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';
import { isInactiveStudent } from '../../lib/studentStatus.js';
import { useModalA11y } from '../../hooks/useModalA11y.js';
import FieldError from '../shared/FieldError.jsx';

type Step = 'template' | 'signers' | 'send';

interface CreateContractModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  leadId?: string;
}

export default function CreateContractModal({ open, onClose, onSuccess, leadId }: CreateContractModalProps) {
  const [formError, setFormError] = React.useState('');
  const [step, setStep] = useState<Step>('template');
  const [showOptionalName, setShowOptionalName] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateContract();
  const { data: templatesData, isLoading: templatesLoading } = useContractTemplates(true);
  const templates = templatesData?.templates || [];
  const templatesConfigured = templatesData?.configured !== false;
  const leads = useLeadStore((s) => s.leads);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);

  const lead = leadId ? (leads || []).find((l) => String(l.id) === String(leadId)) : null;
  const studentInactive = lead ? isInactiveStudent(lead) : false;

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    trigger,
    formState: { errors },
  } = useForm<CreateContractFormValues>({
    defaultValues: {
      name: '',
      sandbox: false,
      signers: [defaultSigner()],
      templateId: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'signers' });
  const sandbox = watch('sandbox');
  const templateId = watch('templateId');
  const signers = watch('signers');

  const emailDeliveryWithoutLeadEmail = useMemo(() => {
    const leadEmail = String(lead?.email || '').trim();
    if (leadEmail) return false;
    return (signers || []).some(
      (s) => String(s?.delivery_method || '') === 'DELIVERY_METHOD_EMAIL'
    );
  }, [lead?.email, signers]);

  useEffect(() => {
    if (!open) return;

    const planName = lead?.plan ? String(lead.plan) : '';
    const suggestedTemplateId =
      templates.length > 0
        ? resolveTemplateIdForPlan(planName, templates, financeConfig?.plans || []) || ''
        : '';

    reset({
      name: lead?.name ? `Contrato — ${String(lead.name).trim()}` : '',
      sandbox: false,
      signers: lead
        ? [
            {
              name: String(lead.name || '').trim(),
              email: String(lead.email || '').trim(),
              phone: String(lead.phone || '').trim(),
              action: 'SIGN',
              delivery_method:
                lead.phone && !lead.email ? 'DELIVERY_METHOD_WHATSAPP' : 'DELIVERY_METHOD_EMAIL',
            },
          ]
        : [defaultSigner()],
      templateId: suggestedTemplateId,
    });
    setFormError('');
    setStep('template');
    setShowOptionalName(false);
    setPreviewUrl(null);
  }, [open, leadId, leads, reset, templates, financeConfig?.plans, lead]);

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
    const parsed = createContractSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFormError(first?.message || 'Verifique os campos');
      return;
    }

    const contractName =
      String(parsed.data.name || '').trim() ||
      (lead?.name ? `Contrato — ${String(lead.name).trim()}` : '') ||
      `Contrato ${new Date().toLocaleDateString('pt-BR')}`;

    try {
      await createMutation.mutateAsync({
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
      });
      addToast({ type: 'success', message: 'Contrato enviado para assinatura.' });
      onSuccess?.();
      close();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao criar contrato';
      setFormError(msg);
      addToast({ type: 'error', message: msg });
    }
  });

  if (!open) return null;

  const stepLabels: Record<Step, string> = {
    template: '1. Modelo',
    signers: '2. Signatários',
    send: '3. Enviar',
  };

  return (
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
              Novo contrato
            </h2>
            <p className="text-small text-muted contracts-modal-steps">
              {stepLabels.template} → {stepLabels.signers} → {stepLabels.send}
            </p>
          </div>
          <button type="button" className="btn-ghost" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {studentInactive ? (
          <p className="contracts-form-error contracts-modal-inactive">
            Aluno desligado ou inativo — não é possível enviar novo contrato.
          </p>
        ) : null}

        <form className="contracts-modal-body" onSubmit={onSubmit} noValidate>
          {step === 'template' ? (
            <div className="contracts-form-block">
              <span className="task-field-label">Modelo de contrato</span>
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
                    Nenhum modelo cadastrado.
                    {navRole === 'owner' ? (
                      <>
                        {' '}
                        <Link to="/empresa?tab=contratos">Criar modelo no editor</Link>
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
                    onChange={(e) => setValue('templateId', e.target.value, { shouldValidate: true })}
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
                      <Link to="/empresa?tab=contratos">Gerenciar modelos no editor</Link>
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
                  <strong>Como funciona:</strong> a Autentique envia um link por e-mail ou WhatsApp. O
                  signatário assina na plataforma da Autentique — não é um botão dentro do Nave.
                </p>
              </div>

              {emailDeliveryWithoutLeadEmail ? (
                <div className="contracts-email-warning" role="alert">
                  <AlertTriangle size={16} aria-hidden />
                  <span>
                    Confira o e-mail no cadastro antes de enviar — o aluno está sem e-mail e a entrega
                    selecionada é por e-mail.
                  </span>
                </div>
              ) : null}

              <div className="contracts-form-block">
                <div className="contracts-signers-head">
                  <span className="task-field-label contracts-signers-label">Revisar signatários</span>
                  <button
                    type="button"
                    className="btn-outline contracts-add-signer"
                    onClick={() => append(defaultSigner())}
                  >
                    <Plus size={14} /> Adicionar signatário
                  </button>
                </div>

                {fields.map((field, index) => (
                  <div key={field.id} className="contracts-signer-card">
                    <div className="contracts-signer-card-head">
                      <FileText size={16} aria-hidden />
                      <span>Signatário {index + 1}</span>
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
                      <div>
                        <label className="task-field-label">Nome</label>
                        <input className="form-input" {...register(`signers.${index}.name`)} />
                        {errors.signers?.[index]?.name ? (
                          <FieldError>{errors.signers[index]?.name?.message}</FieldError>
                        ) : null}
                      </div>
                      <div>
                        <label className="task-field-label">E-mail</label>
                        <input
                          className="form-input"
                          type="email"
                          {...register(`signers.${index}.email`)}
                          placeholder={
                            watch(`signers.${index}.delivery_method`) === 'DELIVERY_METHOD_WHATSAPP'
                              ? 'Opcional para WhatsApp'
                              : ''
                          }
                        />
                        {errors.signers?.[index]?.email ? (
                          <FieldError>{errors.signers[index]?.email?.message}</FieldError>
                        ) : null}
                      </div>
                      <div>
                        <label className="task-field-label">Telefone (opcional)</label>
                        <input className="form-input" {...register(`signers.${index}.phone`)} placeholder="+55..." />
                      </div>
                      <div>
                        <label className="task-field-label">Ação</label>
                        <select className="form-input" {...register(`signers.${index}.action`)}>
                          {ACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="task-field-label">Método de entrega</label>
                        <select className="form-input" {...register(`signers.${index}.delivery_method`)}>
                          {DELIVERY_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {step === 'send' ? (
            <>
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
                disabled={templates.length === 0 || studentInactive}
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
                disabled={studentInactive}
              >
                Revisar envio
                <ChevronRight size={14} />
              </button>
            ) : null}

            {step === 'send' ? (
              <button
                type="submit"
                className="btn-primary"
                disabled={createMutation.isPending || templates.length === 0 || studentInactive}
              >
                {createMutation.isPending ? 'Enviando…' : 'Enviar para assinatura'}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </div>
  );
}
