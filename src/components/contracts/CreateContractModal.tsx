import React, { useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { X, Plus, Trash2, FileText } from 'lucide-react';
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
  const [formError, setFormError] = React.useState('');
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
      templateId: '',
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'signers' });
  const sandbox = watch('sandbox');
  const templateId = watch('templateId');

  useEffect(() => {
    if (!open) return;

    const lead = leadId ? (leads || []).find((l) => String(l.id) === String(leadId)) : null;
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
  }, [open, leadId, leads, reset, templates, financeConfig?.plans]);

  const close = useCallback(() => {
    if (createMutation.isPending) return;
    reset({ name: '', sandbox: false, signers: [defaultSigner()], templateId: '' });
    setFormError('');
    onClose();
  }, [createMutation.isPending, onClose, reset]);

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
              <div className="card" style={{ padding: 12, marginTop: 8 }}>
                <p className="text-small" style={{ margin: 0 }}>
                  Nenhum modelo cadastrado.
                  {navRole === 'owner' ? (
                    <>
                      {' '}
                      <Link to="/contratos?tab=modelos">Criar modelo no editor</Link>
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
                  <p className="text-small text-muted" style={{ marginTop: 6 }}>
                    <Link to="/contratos?tab=modelos">Gerenciar modelos no editor</Link>
                  </p>
                ) : null}
              </>
            )}
            {errors.templateId ? (
              <p className="contracts-field-error">{errors.templateId.message}</p>
            ) : null}
          </div>

          <div className="contracts-autentique-help card" style={{ padding: 12, background: 'var(--surface-hover)' }}>
            <p className="text-small" style={{ margin: 0, lineHeight: 1.5 }}>
              <strong>Como funciona a assinatura:</strong> ao enviar, a Autentique dispara um link por e-mail
              ou WhatsApp (conforme o método de entrega). O signatário abre o link, lê o PDF e confirma a
              assinatura na plataforma da Autentique — não é um botão dentro do Nave. Depois do envio, copie o
              link em <strong>Detalhes do contrato</strong> se precisar reenviar manualmente.
            </p>
          </div>

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
            <button
              type="submit"
              className="btn-primary"
              disabled={createMutation.isPending || templates.length === 0}
            >
              {createMutation.isPending ? 'Enviando…' : 'Enviar para assinatura'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
