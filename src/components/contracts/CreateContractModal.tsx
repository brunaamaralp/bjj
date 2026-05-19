import React, { useCallback, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { X, Plus, Trash2, Upload, FileText } from 'lucide-react';
import {
  createContractSchema,
  defaultSigner,
  ACTION_OPTIONS,
  DELIVERY_OPTIONS,
  type CreateContractFormValues,
} from './contractsSchema.js';
import { useCreateContract } from '../../features/contracts/queries.js';
import { useUiStore } from '../../store/useUiStore.js';

interface CreateContractModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateContractModal({ open, onClose, onSuccess }: CreateContractModalProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [formError, setFormError] = useState('');
  const addToast = useUiStore((s) => s.addToast);
  const createMutation = useCreateContract();

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
      file: undefined as unknown as File,
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'signers' });
  const sandbox = watch('sandbox');

  const close = useCallback(() => {
    if (createMutation.isPending) return;
    reset({ name: '', sandbox: false, signers: [defaultSigner()], file: undefined as unknown as File });
    setFileName('');
    setFormError('');
    onClose();
  }, [createMutation.isPending, onClose, reset]);

  const applyFile = (file: File | undefined) => {
    if (!file) return;
    setValue('file', file, { shouldValidate: true });
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
          email: s.email,
          phone: s.phone || undefined,
          action: s.action,
          delivery_method: s.delivery_method,
        })),
        file: parsed.data.file,
        sandbox: parsed.data.sandbox,
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
            {errors.file ? <p className="contracts-field-error">{String(errors.file.message)}</p> : null}
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
                    <input className="form-input" type="email" {...register(`signers.${index}.email`)} />
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
            {errors.signers && !Array.isArray(errors.signers) ? (
              <p className="contracts-field-error">{errors.signers.message}</p>
            ) : null}
          </div>

          <label className="contracts-sandbox">
            <input type="checkbox" {...register('sandbox')} checked={sandbox} />
            <span>Modo sandbox (teste — não consome créditos)</span>
          </label>

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
