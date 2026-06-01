import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Baby, Users, Dumbbell, CheckCircle2, AlertTriangle } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import SexoSelect from '../components/shared/SexoSelect.jsx';
import TurmaSelect from '../components/shared/TurmaSelect.jsx';
import CustomLeadQuestionFields from '../components/CustomLeadQuestionFields.jsx';
import { maskPhone } from '../lib/masks.js';
import { turmaValueFromForm } from '../lib/academyTurmas.js';
import FieldError from '../components/shared/FieldError.jsx';
import { DateInputField } from '../components/DateInput';
import StatusBanner from '../components/shared/StatusBanner.jsx';

const TYPE_ICONS = {
  Criança: <Baby size={20} />,
  Juniores: <Users size={20} />,
  Adulto: <Dumbbell size={20} />,
};

export default function PublicStudentEnrollment() {
  const { token: tokenParam } = useParams();
  const token = decodeURIComponent(String(tokenParam || '').trim());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [config, setConfig] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const [sexo, setSexo] = useState('');
  const [turmaSelect, setTurmaSelect] = useState('');
  const [turmaOther, setTurmaOther] = useState('');
  const [customAnswers, setCustomAnswers] = useState({});

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    defaultValues: {
      type: 'Adulto',
      isFirstExperience: 'Sim',
      plan: '',
    },
  });

  const leadType = watch('type');

  useEffect(() => {
    if (!token) {
      setLoadError('Link inválido.');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await fetch(
          `/api/leads?route=public-enrollment&token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.sucesso) {
          const msg =
            data.erro === 'link_disabled'
              ? 'Este link de cadastro não está mais ativo.'
              : data.erro === 'invalid_token'
                ? 'Link inválido ou expirado.'
                : 'Não foi possível carregar o formulário.';
          setLoadError(msg);
          setConfig(null);
          return;
        }
        setConfig(data);
      } catch {
        if (!cancelled) setLoadError('Erro de conexão. Tente novamente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const turmas = useMemo(() => config?.turmas || [], [config?.turmas]);

  const onSubmit = async (data) => {
    if (!token || !config) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const cleanPhone = String(data.phone || '').replace(/\D/g, '');
      const turma = turmaValueFromForm(turmaSelect, turmaOther);
      const res = await fetch(`/api/leads?route=public-enrollment&token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          phone: cleanPhone,
          type: data.type,
          plan: data.plan || '',
          parentName: data.parentName || '',
          age: data.age || '',
          sexo,
          turma,
          birthDate: data.birthDate || '',
          notes: data.notes || '',
          isFirstExperience: data.isFirstExperience,
          customAnswers,
        }),
      });
      const body = await res.json().catch(() => ({}));
        if (!res.ok || !body.sucesso) {
        if (body.erro === 'phone_duplicate' || body.erro === 'student_inactive') {
          setSubmitError(body.message || 'Este telefone já está cadastrado.');
        } else if (body.erro === 'plan_required') {
          setSubmitError(body.message || 'Selecione o plano.');
        } else {
          setSubmitError(body.message || 'Não foi possível concluir a matrícula. Tente novamente.');
        }
        return;
      }
      setSubmitted(true);
    } catch {
      setSubmitError('Erro de conexão. Verifique a internet e tente de novo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="public-enrollment-page">
      <header className="public-enrollment-page__header">
        <NaviBrandLockup height={26} variant="light" />
      </header>

      <main className="public-enrollment-page__main">
        {loading ? (
          <p className="text-small text-muted">Carregando formulário…</p>
        ) : loadError ? (
          <div className="card public-enrollment-card" role="alert">
            <AlertTriangle size={22} style={{ color: 'var(--warning)', marginBottom: 8 }} />
            <p style={{ margin: 0 }}>{loadError}</p>
          </div>
        ) : submitted ? (
          <div className="card public-enrollment-card public-enrollment-card--success">
            <CheckCircle2 size={32} style={{ color: 'var(--success)', marginBottom: 12 }} />
            <h1 className="navi-page-title" style={{ fontSize: 22, marginBottom: 8 }}>
              Matrícula enviada!
            </h1>
            <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              {config?.academyName || 'A academia'} recebeu seus dados como aluno matriculado e entrará em contato em
              breve.
            </p>
          </div>
        ) : (
          <>
            <h1 className="navi-page-title public-enrollment-title">
              Matrícula — {config?.academyName}
            </h1>
            <p className="text-small public-enrollment-subtitle">
              Preencha seus dados para concluir a matrícula. Campos com * são obrigatórios.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="public-enrollment-form">
              <div className="card public-enrollment-card">
                <div className="form-group">
                  <label>Nome completo *</label>
                  <input
                    {...register('name', { required: true })}
                    className="form-input"
                    placeholder="Seu nome"
                    autoComplete="name"
                  />
                  {errors.name ? <FieldError>Obrigatório</FieldError> : null}
                </div>

                <div className="form-group">
                  <label>Telefone / WhatsApp *</label>
                  <input
                    {...register('phone', { required: true })}
                    className="form-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(00) 00000-0000"
                    onChange={(e) => {
                      const masked = maskPhone(e.target.value);
                      e.target.value = masked;
                      setValue('phone', masked);
                    }}
                  />
                  {errors.phone ? <FieldError>Obrigatório</FieldError> : null}
                </div>

                <div className="form-group">
                  <label>Data de nascimento</label>
                  <DateInputField {...register('birthDate')} type="date" className="form-input" />
                </div>
              </div>

              {config?.requirePlan && config?.plans?.length > 0 ? (
                <div className="card public-enrollment-card">
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Plano *</label>
                    <select
                      {...register('plan', { required: true })}
                      className="form-input"
                      defaultValue=""
                    >
                      <option value="">Selecione o plano…</option>
                      {config.plans.map((planName) => (
                        <option key={planName} value={planName}>
                          {planName}
                        </option>
                      ))}
                    </select>
                    {errors.plan ? <FieldError>Selecione um plano</FieldError> : null}
                  </div>
                </div>
              ) : null}

              <div className="card public-enrollment-card">
                <label className="type-label">Perfil *</label>
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
                <div className="card public-enrollment-card">
                  <div className="form-group">
                    <label>Nome do responsável {leadType === 'Criança' ? '*' : '(opcional)'}</label>
                    <input
                      {...register('parentName', { required: leadType === 'Criança' })}
                      className="form-input"
                      placeholder="Nome do pai, mãe ou responsável"
                    />
                    {errors.parentName ? <FieldError>Obrigatório</FieldError> : null}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Idade do aluno</label>
                    <input {...register('age')} type="number" className="form-input" placeholder="Ex: 8" min={1} max={99} />
                  </div>
                </div>
              )}

              <div className="card public-enrollment-card">
                <div className="form-group">
                  <label>Sexo</label>
                  <SexoSelect value={sexo} onChange={setSexo} />
                </div>
                {turmas.length > 0 ? (
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label>Turma</label>
                    <TurmaSelect
                      turmas={turmas}
                      selectValue={turmaSelect}
                      otherText={turmaOther}
                      onSelectChange={setTurmaSelect}
                      onOtherChange={setTurmaOther}
                      id="public-enrollment-turma"
                      otherId="public-enrollment-turma-other"
                    />
                  </div>
                ) : null}
              </div>

              <div className="card public-enrollment-card">
                <label className="type-label">Primeira experiência na modalidade?</label>
                <div className="flex gap-4 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input {...register('isFirstExperience')} type="radio" value="Sim" />
                    <span className="text-small">Sim</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input {...register('isFirstExperience')} type="radio" value="Não" />
                    <span className="text-small">Não (já treinei)</span>
                  </label>
                </div>
              </div>

              {config?.customQuestions?.length > 0 ? (
                <div className="card public-enrollment-card">
                  <h3 className="type-label" style={{ marginBottom: 12 }}>
                    Informações adicionais
                  </h3>
                  <CustomLeadQuestionFields
                    questions={config.customQuestions}
                    values={customAnswers}
                    onChange={(qid, val) => setCustomAnswers((prev) => ({ ...prev, [qid]: val }))}
                  />
                </div>
              ) : null}

              <div className="card public-enrollment-card">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Observações</label>
                  <textarea
                    {...register('notes')}
                    className="form-input"
                    rows={3}
                    placeholder="Alguma informação que queira compartilhar?"
                    maxLength={2000}
                  />
                </div>
              </div>

              {submitError ? (
                <StatusBanner variant="error" message={submitError} />
              ) : null}

              <button type="submit" className="btn-primary public-enrollment-submit" disabled={submitting}>
                {submitting ? 'Matriculando…' : 'Concluir matrícula'}
              </button>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
