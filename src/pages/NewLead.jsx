import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLeadStore, LEAD_ORIGIN, LEAD_STATUS } from '../store/useLeadStore';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Baby, Users, Dumbbell, AlertTriangle } from 'lucide-react';

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
    const leads = useLeadStore((state) => state.leads);
    const academyId = useLeadStore((state) => state.academyId);
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

    // Duplicate detection
    const findDuplicate = (phone) => {
        if (!phone || phone.length < 8) return null;
        const cleanInput = phone.replace(/\D/g, '');
        if (cleanInput.length < 8) return null;
        return leads.find(l => {
            const cleanExisting = l.phone?.replace(/\D/g, '') || '';
            return cleanExisting === cleanInput || cleanExisting.endsWith(cleanInput.slice(-8)) || cleanInput.endsWith(cleanExisting.slice(-8));
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
            const payload = {
                ...data,
                status: LEAD_STATUS.SCHEDULED
            };
            const created = await addLead(payload);
            if (created?.id) {
                navigate(`/lead/${encodeURIComponent(created.id)}`);
            } else {
                navigate('/pipeline');
            }
        } catch (e) {
            alert('Erro ao salvar interessado: ' + e.message);
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
                <h2>{`Novo ${leadLabelSingular}`}</h2>
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
                        placeholder="(00) 00000-0000"
                        className={`form-input ${duplicate ? 'input-warning' : ''}`}
                        type="tel"
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

                {/* Equipamento */}
                <div className="card animate-in" style={{ animationDelay: '0.14s' }}>
                    <label className="type-label">Equipamento Emprestado</label>
                    <div className="flex gap-4 mt-2">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Tamanho Camiseta</label>
                            <input {...register('borrowedShirt')} className="form-input" placeholder="Ex: G, 12" />
                        </div>
                    </div>
                </div>

                {/* Agendamento */}
                <div className="card animate-in" style={{ animationDelay: '0.15s' }}>
                    <label className="type-label" style={{ marginBottom: 12 }}>Agendar Aula Experimental</label>
                    <div className="flex gap-2">
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Data</label>
                            <input
                                {...register('scheduledDate', { required: true })}
                                type="date"
                                className="form-input"
                            />
                            {errors.scheduledDate && <span className="error">Obrigatório</span>}
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label>Horário</label>
                            <input
                                {...register('scheduledTime', { required: true })}
                                type="time"
                                step="300"
                                className="form-input"
                            />
                            {errors.scheduledTime && <span className="error">Obrigatório</span>}
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
