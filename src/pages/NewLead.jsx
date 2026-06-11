import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Baby, Users, Dumbbell, AlertTriangle } from 'lucide-react';
import { maskPhone } from '../lib/masks.js';
import { useTerms } from '../lib/terminology.js';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import { useAcademyTurmas } from '../hooks/useAcademyTurmas.js';
import { turmaValueFromForm } from '../lib/academyTurmas.js';
import { useWhatsappTemplates } from '../lib/useWhatsappTemplates.js';
import { DEFAULT_WHATSAPP_TEMPLATES } from '../../lib/whatsappTemplateDefaults.js';
import { parseAutomationsConfig } from '../lib/useAutomations.js';
import { afterExperimentalScheduled } from '../lib/automationDispatch.js';
import { notifyAutomationFeedback } from '../lib/automationUx.js';
import PageHeader from '../components/layout/PageHeader.jsx';
import { friendlyError } from '../lib/errorMessages.js';
import FieldError from '../components/shared/FieldError.jsx';
import { DateInputField } from '../components/DateInput';
import StatusBanner from '../components/shared/StatusBanner.jsx';
import { useStudentStore } from '../store/useStudentStore.js';
import { findLocalLeadByPhone, findLocalStudentByPhone } from '../lib/studentPhoneDuplicate.js';

const TYPE_ICONS = {
    'Criança': <Baby size={20} />,
    'Juniores': <Users size={20} />,
    'Adulto': <Dumbbell size={20} />,
};

const COMMON_TIMES = ['07:00', '08:00', '12:00', '18:00', '19:00', '20:00'];

const nextQuarterTime = () => {
    const d = new Date();
    let m = d.getMinutes();
    const add = 15 - (m % 15 || 15);
    d.setMinutes(m + add, 0, 0);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
};

const NewLead = () => {
    const navigate = useNavigate();
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
    const terms = useTerms();
    const [submitting, setSubmitting] = useState(false);
    const [sexo, setSexo] = useState('');
    const [turmaSelect, setTurmaSelect] = useState('');
    const [turmaOther, setTurmaOther] = useState('');
    const { turmas } = useAcademyTurmas(academyId);

    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
        defaultValues: {
            type: 'Adulto',
            origin: 'Instagram',
            status: LEAD_STATUS.SCHEDULED,
            isFirstExperience: 'Sim'
        }
    });

    const leadType = watch('type');
    const phoneValue = watch('phone');
    const nameValue = watch('name');
    const scheduledDate = watch('scheduledDate') || '';
    const [debouncedPhone, setDebouncedPhone] = useState('');
    const [debouncedName, setDebouncedName] = useState('');

    // Duplicata = mesmo telefone + mesmo nome (irmãos podem compartilhar o telefone do responsável).
    const findDuplicate = useCallback((phone, name) => {
        const inputNorm = String(phone || '').replace(/\D/g, '');
        const displayName = String(name || '').trim();
        if (inputNorm.length < 8 || displayName.length < 2) return null;
        const existingLead = findLocalLeadByPhone(leads, phone, { name: displayName });
        if (existingLead) return { ...existingLead, _duplicateKind: 'lead' };
        const existingStudent = findLocalStudentByPhone(students, phone, { name: displayName });
        if (existingStudent) return { ...existingStudent, _duplicateKind: 'student' };
        return null;
    }, [leads, students]);

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
            let scheduledDate = String(data.scheduledDate || '').trim().split('T')[0];
            let scheduledTime = String(data.scheduledTime || '').trim();
            if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) {
                scheduledDate = '';
            }
            if (scheduledDate && !scheduledTime) {
                scheduledTime = nextQuarterTime();
            }
            const hasSchedule = Boolean(scheduledDate);
            const initialNote = data.notes?.trim();
            const history = initialNote
                ? [{ type: 'note', text: initialNote, at: new Date().toISOString(), by: 'user' }]
                : [];

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
                scheduledDate: scheduledDate || '',
                scheduledTime: scheduledTime || '',
                notes: history,
            });
            if (created?.id && hasSchedule) {
                const autoResult = await afterExperimentalScheduled({
                    lead: {
                        ...created,
                        scheduledDate: scheduledDate || '',
                        scheduledTime: scheduledTime || '',
                    },
                    ymd: scheduledDate,
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
            if (created?.id) {
                navigate(`/lead/${encodeURIComponent(created.id)}`);
            } else {
                navigate('/pipeline');
            }
        } catch (e) {
            addToast({
                type: 'error',
                message: friendlyError(e, 'save')
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

    const singular = (plural) => {
        if (!plural) return 'Lead';
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };
    const leadLabelSingular = singular(useLeadStore.getState().labels?.leads || 'Leads');
    return (
        <div className="container navi-hub-page" style={{ paddingBottom: 30 }}>
            <PageHeader
                title={`Novo ${leadLabelSingular}`}
                subtitle="Cadastre um contato para o funil."
                prefix={
                    <button type="button" className="btn-action-ghost icon-btn" onClick={() => navigate(-1)} aria-label="Voltar">
                        <ArrowLeft size={20} />
                    </button>
                }
            />

            <form onSubmit={submitNewLead} className="flex-col gap-4">
                {/* Nome */}
                <div className="form-group card animate-in">
                    <label>Nome</label>
                    <input
                        {...register('name', { required: true })}
                        placeholder="Ex: João Silva"
                        className="form-input"
                        autoFocus
                    />
                    {errors.name ? <FieldError>Campo obrigatório</FieldError> : null}
                </div>

                {/* Telefone + Duplicate Warning */}
                <div className="form-group card animate-in" style={{ animationDelay: '0.05s' }}>
                    <label>Telefone / WhatsApp{phoneChecking ? ' — Verificando…' : ''}</label>
                    <input
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
                                onClick={() =>
                                    navigate(
                                        duplicate._duplicateKind === 'student'
                                            ? `/student/${encodeURIComponent(duplicate.id)}`
                                            : `/lead/${encodeURIComponent(duplicate.id)}`
                                    )
                                }
                            >
                                {duplicate._duplicateKind === 'student' ? 'Ver aluno existente' : 'Ver lead existente'}
                            </button>
                        </StatusBanner>
                    ) : null}
                </div>

                {/* Tipo */}
                <div className="card animate-in" style={{ animationDelay: '0.1s' }}>
                    <label className="type-label">Perfil</label>
                    <div className="type-grid">
                        {['Criança', 'Juniores', 'Adulto'].map(type => (
                            <label key={type} className={`type-option ${leadType === type ? 'selected' : ''}`}>
                                <input {...register('type')} type="radio" value={type} />
                                <span className="type-icon">{TYPE_ICONS[type]}</span>
                                <span className="type-name">{type}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Campos criança/teen */}
                {(leadType === 'Criança' || leadType === 'Juniores') && (
                    <div className="card animate-in" style={{ borderLeft: '4px solid var(--warning)' }}>
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

                <div className="card animate-in" style={{ animationDelay: '0.115s' }}>
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
                            id="new-lead-turma"
                            otherId="new-lead-turma-other"
                        />
                    </div>
                </div>

                {/* Experiência */}
                <div className="card animate-in" style={{ animationDelay: '0.12s' }}>
                    <label className="type-label">Primeira experiência na modalidade?</label>
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

                    {/* Campo de faixa removido; pode ser configurado em Perguntas do Lead */}
                </div>

                {/* Agendamento */}
                <div className="card animate-in" style={{ animationDelay: '0.15s' }}>
                    <h3 className="type-label" style={{ marginBottom: 12 }}>Agendamento <span className="optional-label" style={{textTransform: 'none', fontWeight: 500}}>(opcional)</span></h3>
                    <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 0, marginBottom: 10 }}>
                        Com data preenchida, o cadastro entra na etapa {terms.trialShort} e na agenda.
                        Se não escolher horário, usamos o próximo horário disponível.
                    </p>
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
                                {COMMON_TIMES.map(t => (
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

                {/* Origem */}
                <div className="form-group card animate-in" style={{ animationDelay: '0.2s' }}>
                    <label>Origem</label>
                    <select {...register('origin')} className="form-input">
                        {LEAD_ORIGIN.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>

                {/* Observações */}
                <div className="form-group card animate-in" style={{ animationDelay: '0.22s' }}>
                    <label>Observações <span className="optional-label" style={{textTransform: 'none', fontWeight: 500}}>(opcional)</span></label>
                    <textarea
                        {...register('notes')}
                        placeholder="Ex: Veio pelo Instagram, perguntou sobre horários de manhã..."
                        rows={3}
                        maxLength={500}
                        className="form-input"
                        style={{ resize: 'vertical' }}
                    />
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    className="btn-secondary btn-large mt-2 animate-in"
                    style={{ animationDelay: '0.25s' }}
                    disabled={submitting || Boolean(duplicate) || phoneChecking || nameChecking}
                >
                    {submitting ? (
                        <div className="flex items-center gap-2">
                            Salvando...
                        </div>
                    ) : (
                        <>
                            <CalendarPlus size={20} /> Salvar e Agendar
                        </>
                    )}
                </button>
            </form>

            <style dangerouslySetInnerHTML={{
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
        .duplicate-alert {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px; border-radius: var(--radius-sm);
          background: var(--warning-light); color: var(--text);
          font-size: 0.82rem; line-height: 1.4;
          margin-top: 4px;
        }
        .duplicate-alert--error {
          background: var(--danger-light);
        }
        .duplicate-alert svg { color: var(--warning); flex-shrink: 0; margin-top: 2px; }
        .duplicate-alert--error svg { color: var(--danger); }
        .duplicate-alert strong { display: block; color: var(--warning); font-size: 0.85rem; }
        .duplicate-alert--error strong { color: var(--danger); }
        .duplicate-alert p { margin: 2px 0 6px; color: var(--text-secondary); }
        .dup-link {
          background: none; border: none; color: var(--accent); font-weight: 600;
          font-size: 0.8rem; padding: 0; min-height: auto; cursor: pointer;
          text-decoration: underline;
        }
      `}} />
        </div>
    );
};

export default NewLead;
