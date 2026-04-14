import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../store/useLeadStore';
import { useUiStore } from '../store/useUiStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Baby, Users, Dumbbell, AlertTriangle, PlusCircle } from 'lucide-react';

const TYPE_ICONS = {
    'Criança': <Baby size={20} />,
    'Juniores': <Users size={20} />,
    'Adulto': <Dumbbell size={20} />,
};

const COMMON_TIMES = ['07:00', '08:00', '12:00', '18:00', '19:00', '20:00'];

/** Só dígitos; remove 55 inicial para comparar mesmo número salvo com/sem país. */
function normalizePhoneDedup(raw) {
    let d = String(raw ?? '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
    return d;
}

function maskPhone(value) {
    if (!value) return '';
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
        return digits
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2');
    }
    return digits
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
}

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
    const leads = useLeadStore((state) => state.leads);
    const academyId = useLeadStore((state) => state.academyId);
    const addToast = useUiStore((state) => state.addToast);
    const [submitting, setSubmitting] = useState(false);

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

    // Aviso de duplicata só com telefone completo e igualdade exata (após normalizar).
    // Não usar “últimos 8 dígitos”: gera falso positivo entre DDDs diferentes e com alunos importados com lixo/CPF no campo.
    const findDuplicate = (phone) => {
        const inputNorm = normalizePhoneDedup(phone);
        if (inputNorm.length < 8) return null;
        return leads.find((l) => {
            const exNorm = normalizePhoneDedup(l.phone);
            if (exNorm.length < 8) return false;
            return exNorm === inputNorm;
        });
    };

    const duplicate = findDuplicate(phoneValue);

    const onSubmit = async (data) => {
        if (!academyId) {
            alert('Erro: Academia não identificada. Por favor, recarregue a página.');
            return;
        }

        setSubmitting(true);
        try {
            const hasSchedule = !!data.scheduledDate && !!data.scheduledTime;
            const initialNote = data.notes?.trim();
            const history = initialNote
                ? [{ type: 'note', text: initialNote, at: new Date().toISOString(), by: 'user' }]
                : [];

            const cleanPhone = data.phone.replace(/\D/g, '');

            const created = await addLead({
                name: data.name,
                phone: cleanPhone,
                contact_type: 'lead',
                type: data.type,
                origin: data.origin,
                status: hasSchedule ? LEAD_STATUS.SCHEDULED : LEAD_STATUS.NEW,
                pipelineStage: hasSchedule ? 'Aula experimental' : 'Novo',
                isFirstExperience: data.isFirstExperience,
                parentName: data.parentName || '',
                age: data.age || '',
                scheduledDate: data.scheduledDate || '',
                scheduledTime: data.scheduledTime || '',
                notes: history,
            });
            if (created?.id) {
                navigate(`/lead/${encodeURIComponent(created.id)}`);
            } else {
                navigate('/pipeline');
            }
        } catch (e) {
            addToast({
                type: 'error',
                message: e?.message || 'Não foi possível cadastrar o lead. Tente novamente.'
            });
        } finally {
            setSubmitting(false);
        }
    };

    const singular = (plural) => {
        if (!plural) return 'Lead';
        const p = String(plural).trim();
        if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1);
        return p;
    };
    const leadLabelSingular = singular(useLeadStore.getState().labels?.leads || 'Leads');
    return (
        <div className="container" style={{ paddingTop: 20, paddingBottom: 30 }}>
            <div className="flex items-center gap-4">
                <button className="icon-btn" onClick={() => navigate(-1)}><ArrowLeft size={22} /></button>
                <h2 className="navi-page-title">{`Novo ${leadLabelSingular}`}</h2>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="flex-col gap-4 mt-4">
                {/* Nome */}
                <div className="form-group card animate-in">
                    <label>Nome</label>
                    <input
                        {...register('name', { required: true })}
                        placeholder="Ex: João Silva"
                        className="form-input"
                        autoFocus
                    />
                    {errors.name && <span className="error">Campo obrigatório</span>}
                </div>

                {/* Telefone + Duplicate Warning */}
                <div className="form-group card animate-in" style={{ animationDelay: '0.05s' }}>
                    <label>Telefone / WhatsApp</label>
                    <input
                        {...register('phone', { required: true })}
                        onChange={(e) => {
                            const masked = maskPhone(e.target.value);
                            e.target.value = masked;
                            setValue('phone', masked);
                        }}
                        placeholder="(00) 00000-0000"
                        className={`form-input ${duplicate ? 'input-warning' : ''}`}
                        type="tel"
                        inputMode="numeric"
                    />
                    {errors.phone && <span className="error">Campo obrigatório</span>}

                    {duplicate && (
                        <div className="duplicate-alert animate-in">
                            <AlertTriangle size={16} />
                            <div>
                                <strong>Possível duplicado!</strong>
                                <p>"{duplicate.name}" já está cadastrado com este telefone ({duplicate.status}).</p>
                                <button
                                    type="button"
                                    className="dup-link"
                                    onClick={() => navigate(`/lead/${duplicate.id}`)}
                                >
                                    Ver cadastro existente →
                                </button>
                            </div>
                        </div>
                    )}
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
                    <div className="flex gap-2">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Data</label>
                            <input
                                {...register('scheduledDate', { required: false })}
                                type="date"
                                className="form-input"
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
                    disabled={submitting}
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
        .type-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }
        .type-option {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          padding: 14px 8px; border: 2px solid var(--border); border-radius: var(--radius-sm);
          text-align: center; cursor: pointer; transition: var(--transition);
          gap: 6px; background: var(--surface);
        }
        .type-option input { display: none; }
        .type-option .type-icon { color: var(--text-muted); transition: var(--transition); }
        .type-option .type-name { font-size: 0.8rem; font-weight: 700; color: var(--text-secondary); }
        .type-option.selected { border-color: var(--accent); background: var(--accent-light); }
        .type-option.selected .type-icon { color: var(--accent); }
        .type-option.selected .type-name { color: var(--accent); }
        .type-option:active { transform: scale(0.96); }
        .input-warning { border-color: var(--warning) !important; }
        .duplicate-alert {
          display: flex; gap: 10px; align-items: flex-start;
          padding: 12px; border-radius: var(--radius-sm);
          background: var(--warning-light); color: var(--text);
          font-size: 0.82rem; line-height: 1.4;
          margin-top: 4px;
        }
        .duplicate-alert svg { color: var(--warning); flex-shrink: 0; margin-top: 2px; }
        .duplicate-alert strong { display: block; color: var(--warning); font-size: 0.85rem; }
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
