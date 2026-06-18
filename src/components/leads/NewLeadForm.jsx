import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { Save } from 'lucide-react';
import { maskPhone } from '../../lib/masks.js';
import SexoSelect from '../shared/SexoSelect.jsx';
import TurmaSelect from '../shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../../hooks/useAcademyTurmas.js';
import { turmaValueFromForm } from '../../lib/academyTurmas.js';
import { useWhatsappTemplates } from '../../lib/useWhatsappTemplates.js';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../../lib/whatsappTemplateDefaults.js';
import { parseAutomationsConfig } from '../../lib/useAutomations.js';
import { afterExperimentalScheduled } from '../../lib/automationDispatch.js';
import { notifyAutomationFeedback } from '../../lib/automationUx.js';
import { friendlyError } from '../../lib/errorMessages.js';
import FieldError from '../shared/FieldError.jsx';
import { DateInputField } from '../DateInput';
import StatusBanner from '../shared/StatusBanner.jsx';
import { useStudentStore } from '../../store/useStudentStore.js';
import { findLocalLeadByPhone, findLocalStudentByPhone } from '../../lib/studentPhoneDuplicate.js';
import { Baby, Users, Dumbbell } from 'lucide-react';

const TYPE_ICONS = {
  Criança: <Baby size={20} />,
  Juniores: <Users size={20} />,
  Adulto: <Dumbbell size={20} />,
};

const COMMON_TIMES = ['07:00', '08:00', '12:00', '18:00', '19:00', '20:00'];

const nextQuarterTime = () => {
  const d = new Date();
  const m = d.getMinutes();
  const add = 15 - (m % 15 || 15);
  d.setMinutes(m + add, 0, 0);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

/**
 * @param {{
 *   variant?: 'page' | 'modal';
 *   formId?: string;
 *   autoFocus?: boolean;
 *   onSuccess?: (created: object | null) => void;
 *   onViewExisting?: (duplicate: object) => void;
 *   onFooterStateChange?: (state: { submitting: boolean; canSubmit: boolean; submitLabel: string }) => void;
 * }} props
 */
export default function NewLeadForm({
  variant = 'page',
  formId = 'new-lead-form',
  autoFocus = true,
  onSuccess,
  onViewExisting,
  onFooterStateChange,
}) {
  const isModal = variant === 'modal';
  const addLead = useLeadStore((state) => state.addLead);
  const updateLead = useLeadStore((state) => state.updateLead);
  const leads = useLeadStore((state) => state.leads);
  const students = useStudentStore((state) => state.students);
  const academyId = useLeadStore((state) => state.academyId);
  const {
    templates: waTemplates,
    academyName: waName,
    zapsterInstanceId: waZapId,
    automationsRaw,
  } = useWhatsappTemplates(academyId);
  const automationConfig = useMemo(
    () => parseAutomationsConfig(automationsRaw),
    [automationsRaw]
  );
  const addToast = useUiStore((state) => state.addToast);
  const [submitting, setSubmitting] = useState(false);
  const [sexo, setSexo] = useState('');
  const [turmaSelect, setTurmaSelect] = useState('');
  const [turmaOther, setTurmaOther] = useState('');
  const { turmas } = useAcademyTurmas(academyId);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      type: 'Adulto',
      origin: 'Instagram',
      status: LEAD_STATUS.NEW,
      scheduledDate: '',
      scheduledTime: '',
      isFirstExperience: 'Sim',
    },
  });

  const leadType = watch('type');
  const phoneValue = watch('phone');
  const nameValue = watch('name');
  const scheduledDate = watch('scheduledDate') || '';
  const scheduledTimeValue = watch('scheduledTime') || '';
  const [debouncedPhone, setDebouncedPhone] = useState('');
  const [debouncedName, setDebouncedName] = useState('');

  const findDuplicate = useCallback(
    (phone, name) => {
      const inputNorm = String(phone || '').replace(/\D/g, '');
      const displayName = String(name || '').trim();
      if (inputNorm.length < 8 || displayName.length < 2) return null;
      const existingLead = findLocalLeadByPhone(leads, phone, { name: displayName });
      if (existingLead) return { ...existingLead, _duplicateKind: 'lead' };
      const existingStudent = findLocalStudentByPhone(students, phone, { name: displayName });
      if (existingStudent) return { ...existingStudent, _duplicateKind: 'student' };
      return null;
    },
    [leads, students]
  );

  useEffect(() => {
    const d = String(phoneValue || '').replace(/\D/g, '');
    if (d.length < 8) {
      setDebouncedPhone(String(phoneValue || ''));
      return undefined;
    }
    const t = window.setTimeout(() => setDebouncedPhone(String(phoneValue || '')), 400);
    return () => window.clearTimeout(t);
  }, [phoneValue]);

  useEffect(() => {
    const n = String(nameValue || '').trim();
    if (n.length < 2) {
      setDebouncedName(String(nameValue || ''));
      return undefined;
    }
    const t = window.setTimeout(() => setDebouncedName(String(nameValue || '')), 400);
    return () => window.clearTimeout(t);
  }, [nameValue]);

  const phoneChecking = useMemo(() => {
    const d = String(phoneValue || '').replace(/\D/g, '');
    if (d.length < 8) return false;
    return debouncedPhone !== phoneValue;
  }, [phoneValue, debouncedPhone]);

  const nameChecking = useMemo(() => {
    const n = String(nameValue || '').trim();
    if (n.length < 2) return false;
    return debouncedName !== nameValue;
  }, [nameValue, debouncedName]);

  const duplicate = useMemo(
    () => findDuplicate(debouncedPhone, debouncedName),
    [debouncedPhone, debouncedName, findDuplicate]
  );

  const canSubmit = !submitting && !duplicate && !phoneChecking && !nameChecking;
  const submitLabel =
    scheduledDate && scheduledTimeValue ? 'Salvar e agendar' : 'Salvar';

  useEffect(() => {
    onFooterStateChange?.({
      submitting,
      canSubmit,
      submitLabel,
    });
  }, [submitting, canSubmit, submitLabel, onFooterStateChange]);

  const onSubmit = async (data) => {
    if (!academyId) {
      addToast({ type: 'error', message: 'Academia não identificada. Recarregue a página e tente novamente.' });
      return;
    }
    if (phoneChecking || nameChecking) {
      addToast({ type: 'warning', message: 'Aguarde a verificação do cadastro.' });
      return;
    }

    const dupBlocking = findDuplicate(data.phone, data.name);
    if (dupBlocking) {
      const kind = dupBlocking._duplicateKind === 'student' ? 'aluno' : 'lead';
      addToast({
        type: 'error',
        message: `Este telefone já está cadastrado para ${dupBlocking.name} como ${kind}.`,
      });
      return;
    }

    setSubmitting(true);
    try {
      let scheduledDateValue = String(data.scheduledDate || '').trim().split('T')[0];
      let scheduledTime = String(data.scheduledTime || '').trim();
      if (scheduledDateValue && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDateValue)) {
        scheduledDateValue = '';
      }
      const hasSchedule = Boolean(scheduledDateValue && scheduledTime);
      if (!hasSchedule) {
        scheduledDateValue = '';
        scheduledTime = '';
      }
      const initialNote = data.notes?.trim();

      const cleanPhone = data.phone.replace(/\D/g, '');
      const turma = turmaValueFromForm(turmaSelect, turmaOther);

      const created = await addLead({
        name: data.name,
        phone: cleanPhone,
        contact_type: 'lead',
        type: data.type,
        sexo: sexo || undefined,
        turma: turma || undefined,
        origin: data.origin,
        status: hasSchedule ? LEAD_STATUS.SCHEDULED : LEAD_STATUS.NEW,
        pipelineStage: hasSchedule ? 'Aula experimental' : 'Novo',
        isFirstExperience: data.isFirstExperience,
        parentName: data.parentName || '',
        age: data.age || '',
        scheduledDate: scheduledDateValue || '',
        scheduledTime: scheduledTime || '',
        initialNote: initialNote || undefined,
      });
      if (created?.id && hasSchedule) {
        const autoResult = await afterExperimentalScheduled({
          lead: {
            ...created,
            scheduledDate: scheduledDateValue || '',
            scheduledTime: scheduledTime || '',
          },
          ymd: scheduledDateValue,
          time: scheduledTime,
          academyId,
          waOutbound: {
            name: waName || '',
            zapster_instance_id: waZapId || '',
            templates: waTemplates || DEFAULT_WHATSAPP_TEMPLATES,
          },
          academyRaw: automationsRaw,
          automationConfig,
          updateLead,
          getLead: () =>
            useLeadStore.getState().leads.find((l) => l.id === created.id) || created,
        }).catch(() => null);
        if (autoResult) notifyAutomationFeedback(addToast, autoResult);
      }
      onSuccess?.(created ?? null);
    } catch (e) {
      addToast({
        type: 'error',
        message: friendlyError(e, 'save'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const submitNewLead = (e) => {
    const active = document.activeElement;
    if (active && typeof active.blur === 'function') active.blur();
    return handleSubmit(onSubmit)(e);
  };

  const sectionClass = isModal ? 'new-lead-form__section' : 'card animate-in';
  const turmaId = isModal ? 'new-lead-modal-turma' : 'new-lead-turma';
  const turmaOtherId = isModal ? 'new-lead-modal-turma-other' : 'new-lead-turma-other';

  return (
    <>
      <form id={formId} onSubmit={submitNewLead} className={`new-lead-form flex-col gap-4${isModal ? ' new-lead-form--modal' : ''}`}>
        <div className={sectionClass}>
          <label htmlFor={`${formId}-name`}>
            {leadType === 'Criança' || leadType === 'Juniores' ? 'Nome do aluno' : 'Nome'}
          </label>
          <input
            id={`${formId}-name`}
            {...register('name', { required: true })}
            placeholder={
              leadType === 'Criança' || leadType === 'Juniores'
                ? 'Ex: nome de quem vai treinar'
                : 'Ex: João Silva'
            }
            className="form-input"
            autoFocus={autoFocus}
          />
          {errors.name ? <FieldError>Campo obrigatório</FieldError> : null}
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.05s' }}>
          <label htmlFor={`${formId}-phone`}>
            Telefone / WhatsApp{phoneChecking ? ' — Verificando…' : ''}
          </label>
          <input
            id={`${formId}-phone`}
            {...register('phone', { required: true })}
            onChange={(e) => {
              const masked = maskPhone(e.target.value);
              e.target.value = masked;
              setValue('phone', masked);
            }}
            placeholder="(00) 00000-0000"
            className={`form-input ${duplicate && !phoneChecking ? 'input-error-duplicate' : ''}`}
            type="tel"
            inputMode="numeric"
            aria-busy={phoneChecking || undefined}
          />
          {errors.phone ? <FieldError>Campo obrigatório</FieldError> : null}

          {duplicate && !phoneChecking && !nameChecking ? (
            <StatusBanner variant="warning" className="new-lead-duplicate-banner animate-in">
              <strong>Cadastro já existente</strong>
              <p style={{ margin: '4px 0 0' }}>
                Já existe um cadastro com este telefone e nome
                {duplicate._duplicateKind === 'student' ? ' (aluno)' : ''} — {duplicate.name}
              </p>
              <button
                type="button"
                className="dup-link"
                onClick={() => onViewExisting?.(duplicate)}
              >
                {duplicate._duplicateKind === 'student' ? 'Ver aluno existente' : 'Ver lead existente'}
              </button>
            </StatusBanner>
          ) : null}
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.1s' }}>
          <span className="type-label">Perfil</span>
          <div className="type-grid">
            {['Criança', 'Juniores', 'Adulto'].map((type) => (
              <label key={type} className={`type-option ${leadType === type ? 'selected' : ''}`}>
                <input {...register('type')} type="radio" value={type} />
                <span className="type-icon">{TYPE_ICONS[type]}</span>
                <span className="type-name">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {(leadType === 'Criança' || leadType === 'Juniores') && (
          <div
            className={sectionClass}
            style={isModal ? undefined : { borderLeft: '4px solid var(--warning)' }}
          >
            <div className="form-group">
              <label>Nome do Responsável {leadType === 'Juniores' && '(Opcional)'}</label>
              <input {...register('parentName')} className="form-input" placeholder="Nome do pai/mãe" />
            </div>
            <div className="form-group mt-3">
              <label>Idade</label>
              <input {...register('age')} type="number" className="form-input" placeholder="Ex: 8" />
            </div>
          </div>
        )}

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.115s' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label>Sexo</label>
              <SexoSelect value={sexo} onChange={setSexo} />
            </div>
          </div>
          <div className="form-group mt-3" style={{ marginBottom: 0 }}>
            <label>Turma</label>
            <TurmaSelect
              turmas={turmas}
              selectValue={turmaSelect}
              otherText={turmaOther}
              onSelectChange={setTurmaSelect}
              onOtherChange={setTurmaOther}
              id={turmaId}
              otherId={turmaOtherId}
            />
          </div>
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.12s' }}>
          <span className="type-label">Primeira experiência na modalidade?</span>
          <div className="flex gap-4 mt-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register('isFirstExperience')} type="radio" value="Sim" />
              <span className="text-small">Sim</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input {...register('isFirstExperience')} type="radio" value="Não" />
              <span className="text-small">Não (Já treinou)</span>
            </label>
          </div>
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.15s' }}>
          <h3 className="type-label" style={{ marginBottom: 12 }}>
            Agendamento{' '}
            <span className="optional-label" style={{ textTransform: 'none', fontWeight: 500 }}>
              (opcional)
            </span>
          </h3>
          <div className="flex gap-2">
            <div className="form-group" style={{ flex: 1 }}>
              <label>Data</label>
              <DateInputField
                type="date"
                className="form-input"
                value={scheduledDate}
                onChange={(e) => setValue('scheduledDate', e.target.value, { shouldDirty: true })}
              />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label>Horário</label>
              <input
                {...register('scheduledTime', { required: false })}
                type="time"
                step="300"
                className="form-input"
              />
              <div className="time-chips mt-2">
                <button type="button" className="time-chip" onClick={() => setValue('scheduledTime', nextQuarterTime())}>
                  Próximo
                </button>
                {COMMON_TIMES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`time-chip ${watch('scheduledTime') === t ? 'active' : ''}`}
                    onClick={() => setValue('scheduledTime', t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.2s' }}>
          <label>Origem</label>
          <select {...register('origin')} className="form-input">
            {LEAD_ORIGIN.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className={sectionClass} style={isModal ? undefined : { animationDelay: '0.22s' }}>
          <label>
            Observações{' '}
            <span className="optional-label" style={{ textTransform: 'none', fontWeight: 500 }}>
              (opcional)
            </span>
          </label>
          <textarea
            {...register('notes')}
            placeholder="Ex: Veio pelo Instagram, perguntou sobre horários de manhã..."
            rows={3}
            maxLength={500}
            className="form-input"
            style={{ resize: 'vertical' }}
          />
        </div>

        {!isModal ? (
          <div className="new-lead-actions flex-col gap-2 mt-2 animate-in" style={{ animationDelay: '0.25s' }}>
            <button type="submit" className="btn-primary btn-large" disabled={!canSubmit}>
              {submitting ? (
                <span>Salvando…</span>
              ) : (
                <>
                  <Save size={20} aria-hidden />
                  {submitLabel}
                </>
              )}
            </button>
          </div>
        ) : null}
      </form>

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .type-label {
          font-size: 0.8rem; font-weight: 600; color: var(--text-secondary);
          text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; display: block;
        }
        .time-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .time-chip {
          min-height: 32px; padding: 6px 10px; border-radius: var(--radius-full);
          background: var(--surface-hover); border: 1px solid var(--border);
          font-size: 0.78rem; font-weight: 700; color: var(--text-secondary);
        }
        .time-chip.active, .time-chip:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-light); }
        .type-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
          gap: 10px;
        }
        .type-option {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 14px 8px; border: 2px solid var(--border); border-radius: var(--radius-sm);
          text-align: center; cursor: pointer; transition: var(--transition);
          gap: 6px; background: var(--surface);
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
        }
        .type-option input { display: none; }
        .type-option .type-icon { color: var(--text-muted); transition: var(--transition); flex-shrink: 0; }
        .type-option .type-name {
          font-size: 0.8rem; font-weight: 700; color: var(--text-secondary);
          line-height: 1.25;
          max-width: 100%;
          overflow-wrap: break-word;
          word-break: break-word;
        }
        .type-option.selected { border-color: var(--accent); background: var(--accent-light); }
        .type-option.selected .type-icon { color: var(--accent); }
        .type-option.selected .type-name { color: var(--accent); }
        .type-option:active { transform: scale(0.96); }
        .input-error-duplicate { border-color: var(--danger) !important; }
        .dup-link {
          background: none; border: none; color: var(--accent); font-weight: 600;
          font-size: 0.8rem; padding: 0; min-height: auto; cursor: pointer;
          text-decoration: underline;
        }
        .new-lead-form--modal .new-lead-form__section {
          padding: 0;
          border: none;
          background: transparent;
          box-shadow: none;
        }
        .new-lead-form--modal .new-lead-form__section + .new-lead-form__section {
          padding-top: 12px;
          border-top: 1px solid var(--border);
        }
      `,
        }}
      />
    </>
  );
}
