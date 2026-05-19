import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { X, Plus, Trash2, Upload, FileText } from 'lucide-react';
import {
  createContractSchema,
  defaultSigner,
  ACTION_OPTIONS,
  DELIVERY_OPTIONS,
  type CreateContractFormValues,
} from './contractsSchema.js';
import { useCreateContract, useContractTemplates } from '../../features/contracts/queries.js';
import { resolveTemplateIdForPlan } from '../../features/contracts/templatesApi.js';
import { useUiStore } from '../../store/useUiStore.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { useUserRole } from '../../lib/useUserRole.js';

interface CreateContractModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  leadId?: string;
}

export default function CreateContractModal({ open, onClose, onSuccess, leadId }: CreateContractModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [formError, setFormError] = useState('');
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateContract();
  const { data: templatesData } = useContractTemplates(true);
  const templates = templatesData?.templates || [];
  const templatesConfigured = templatesData?.configured !== false;
  const leads = useLeadStore((s) => s.leads);
  const financeConfig = useLeadStore((s) => s.financeConfig);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = academyList.find((a) => a.id === academyId) || null;
  const navRole = useUserRole(academyDoc);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<CreateContractFormValues>({
    defaultValues: {
      name: '',
      sandbox: false,
      signers: [defaultSigner()],
      pdfSource: 'template',
      templateId: '',
      file: undefined,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'signers' });
  const sandbox = watch('sandbox');
  const pdfSource = watch('pdfSource');
  const templateId = watch('templateId');

  useEffect(() => {
    if (!open) return;

    const lead = leadId ? (leads || []).find((l) => String(l.id) === String(leadId)) : null;
    const planName = lead?.plan ? String(lead.plan) : '';
    const suggestedTemplateId =
      templatesConfigured && templates.length
        ? resolveTemplateIdForPlan(planName, templates, financeConfig?.plans || []) || ''
        : '';

    const useTemplate = Boolean(suggestedTemplateId);

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
      pdfSource: useTemplate ? 'template' : templates.length ? 'template' : 'upload',
      templateId: suggestedTemplateId,
      file: undefined,
    });
    setFileName('');
    setFormError('');
  }, [open, leadId, leads, reset, templates, templatesConfigured, financeConfig?.plans]);

  const close = useCallback(() => {
    if (createMutation.isPending) return;
    reset({
      name: '',
      sandbox: false,
      signers: [defaultSigner()],
      pdfSource: templates.length ? 'template' : 'upload',
      templateId: '',
      file: undefined,
    });
    setFileName('');
    setFormError('');
    onClose();
  }, [createMutation.isPending, onClose, reset, templates.length]);

  const applyFile = (file: File | undefined) => {
    if (!file) return;
    setValue('file', file, { shouldValidate: true });
    setValue('pdfSource', 'upload');
    setFileName(file.name);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError('');
    const parsed = createContractSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      setFormError(first?.message || 'Verifique os campos');
      return;
    }

    try {
      await createMutation.mutateAsync({
        name: parsed.data.name,
        signers: parsed.data.signers.map((s) => ({
          name: s.name,
          email: s.email?.trim() || undefined,
          phone: s.phone?.trim() || undefined,
          action: s.action,
          delivery_method: s.delivery_method,
        })),
        file: parsed.data.pdfSource === 'upload' ? parsed.data.file : undefined,
        templateId:
          parsed.data.pdfSource === 'template' ? String(parsed.data.templateId || '').trim() : undefined,
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
          <h2 id="create-contract-title" className="navi-section-heading" style={{ margin: 0 }}>
            Novo contrato
          </h2>
          <button type="button" className="btn-ghost" onClick={close} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <form className="contracts-modal-body" onSubmit={onSubmit} noValidate>
          <div className="contracts-form-block">
            <label className="task-field-label" htmlFor="contract-name">
              Nome do contrato
            </label>
            <input
              id="contract-name"
              className="form-input"
              {...register('name')}
              placeholder="Ex.: Contrato de matrícula — João Silva"
            />
            {errors.name ? <p className="contracts-field-error">{errors.name.message}</p> : null}
          </div>

          {templatesConfigured && templates.length > 0 ? (
            <div className="contracts-form-block">
              <span className="task-field-label">Documento</span>
              <div className="flex gap-2" style={{ marginBottom: 10 }}>
                <label className="contracts-sandbox" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    value="template"
                    checked={pdfSource === 'template'}
                    onChange={() => {
                      setValue('pdfSource', 'template');
                      setValue('file', undefined);
                      setFileName('');
                    }}
                  />
                  <span>Usar modelo</span>
                </label>
                <label className="contracts-sandbox" style={{ margin: 0 }}>
                  <input
                    type="radio"
                    value="upload"
                    checked={pdfSource === 'upload'}
                    onChange={() => setValue('pdfSource', 'upload')}
                  />
                  <span>Enviar PDF</span>
                </label>
              </div>

              {pdfSource === 'template' ? (
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
                  {errors.templateId ? (
                    <p className="contracts-field-error">{errors.templateId.message}</p>
                  ) : null}
                </>
              ) : (
                <div
                  className={`contracts-upload-zone${dragOver ? ' contracts-upload-zone--active' : ''}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    applyFile(e.dataTransfer.files?.[0]);
                  }}
                  onClick={() => fileRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
                  }}
                >
                  <Upload size={28} strokeWidth={1.5} aria-hidden />
                  <p className="contracts-upload-title">
                    {fileName ? fileName : 'Arraste o PDF ou clique para selecionar'}
                  </p>
                  <p className="text-small text-muted">Apenas arquivos .pdf</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/pdf,.pdf"
                    hidden
                    onChange={(e) => applyFile(e.target.files?.[0])}
                  />
                </div>
              )}
              {errors.file ? <p className="contracts-field-error">{String(errors.file.message)}</p> : null}
            </div>
          ) : (
            <div className="contracts-form-block">
              <input type="hidden" {...register('pdfSource')} value="upload" />
              <span className="task-field-label">Arquivo PDF</span>
              <div
                className={`contracts-upload-zone${dragOver ? ' contracts-upload-zone--active' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  applyFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
              >
                <Upload size={28} strokeWidth={1.5} aria-hidden />
                <p className="contracts-upload-title">
                  {fileName ? fileName : 'Arraste o PDF ou clique para selecionar'}
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  hidden
                  onChange={(e) => applyFile(e.target.files?.[0])}
                />
              </div>
              {errors.file ? <p className="contracts-field-error">{String(errors.file.message)}</p> : null}
            </div>
          )}

          <div className="contracts-form-block">
            <div className="contracts-signers-head">
              <span className="task-field-label" style={{ margin: 0 }}>
                Signatários
              </span>
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
                      <p className="contracts-field-error">{errors.signers[index]?.name?.message}</p>
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
                      <p className="contracts-field-error">{errors.signers[index]?.email?.message}</p>
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

          {navRole === 'owner' ? (
            <label className="contracts-sandbox">
              <input type="checkbox" {...register('sandbox')} checked={sandbox} />
              <span>Modo sandbox (teste — não consome créditos)</span>
            </label>
          ) : null}

          {formError ? <p className="contracts-form-error">{formError}</p> : null}

          <div className="contracts-modal-footer">
            <button type="button" className="btn-outline" onClick={close} disabled={createMutation.isPending}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Enviando…' : 'Enviar para assinatura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



