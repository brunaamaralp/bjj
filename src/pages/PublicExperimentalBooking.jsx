import '../styles/public-enrollment.css';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Calendar, CheckCircle2 } from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import { maskPhone } from '../lib/masks.js';
import FieldError from '../components/shared/FieldError.jsx';
import { DateInputField } from '../components/DateInput';
import StatusBanner from '../components/shared/StatusBanner.jsx';
import { inferProfileTypeFromBirthDate } from '../lib/publicExperimentalAudience.js';

function formatSlotDateBr(ymd) {
  const s = String(ymd || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

export default function PublicExperimentalBooking() {
  const { token: tokenParam } = useParams();
  const token = decodeURIComponent(String(tokenParam || '').trim());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [config, setConfig] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [parentName, setParentName] = useState('');
  const [slotId, setSlotId] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);

  const profileType = useMemo(
    () => (birthDate ? inferProfileTypeFromBirthDate(birthDate) : null),
    [birthDate]
  );
  const minorProfile = profileType === 'Criança' || profileType === 'Juniores';

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
          `/api/leads?route=public-experimental&token=${encodeURIComponent(token)}`
        );
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.sucesso) {
          const msg =
            data.erro === 'link_disabled'
              ? 'Este link de agendamento não está mais ativo.'
              : data.erro === 'invalid_token'
                ? 'Link inválido ou expirado.'
                : 'Não foi possível carregar o formulário.';
          setLoadError(msg);
          setConfig(null);
          return;
        }
        setConfig(data);
        setSlots(Array.isArray(data.slots) ? data.slots : []);
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

  const fetchSlots = useCallback(
    async (ymd) => {
      if (!token || !ymd) return;
      setSlotsLoading(true);
      try {
        const res = await fetch(
          `/api/leads?route=public-experimental&token=${encodeURIComponent(token)}&birth_date=${encodeURIComponent(ymd)}`
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.sucesso) {
          setSlots(Array.isArray(data.slots) ? data.slots : []);
          setSlotId('');
        }
      } catch {
        void 0;
      } finally {
        setSlotsLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    if (birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate.slice(0, 10))) {
      void fetchSlots(birthDate.slice(0, 10));
    }
  }, [birthDate, fetchSlots]);

  const slotsByDate = useMemo(() => {
    const map = new Map();
    for (const slot of slots) {
      const d = String(slot.slot_date || '').slice(0, 10);
      if (!map.has(d)) map.set(d, []);
      map.get(d).push(slot);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!token || !config) return;

    const errors = {};
    if (!String(name).trim()) errors.name = 'Informe o nome.';
    const cleanPhone = String(phone).replace(/\D/g, '');
    if (cleanPhone.length < 10) errors.phone = 'Informe um telefone válido.';
    if (!birthDate) errors.birthDate = 'Informe a data de nascimento.';
    if (minorProfile && !String(parentName).trim()) {
      errors.parentName = 'Informe o nome do responsável.';
    }
    if (slots.length > 0 && !slotId) {
      errors.slotId = 'Escolha um horário.';
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(
        `/api/leads?route=public-experimental&token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: String(name).trim(),
            phone: cleanPhone,
            birthDate: birthDate.slice(0, 10),
            parentName: String(parentName).trim(),
            slot_id: slotId || '',
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.sucesso) {
        if (body.erro === 'slot_full') {
          setSubmitError(body.message || 'Horário lotado. Escolha outro.');
          void fetchSlots(birthDate.slice(0, 10));
        } else if (body.erro === 'student_already_exists' || body.erro === 'lead_converted') {
          setSubmitError(body.message || 'Entre em contato com a academia.');
        } else if (body.erro === 'parent_required') {
          setFieldErrors((p) => ({ ...p, parentName: body.message }));
        } else {
          setSubmitError(body.message || 'Não foi possível agendar. Tente novamente.');
        }
        return;
      }
      setResult(body);
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
        <NaviBrandLockup />
      </header>
      <main className="public-enrollment-page__main">
        {loading ? (
          <p className="text-muted">Carregando…</p>
        ) : loadError ? (
          <div className="card public-enrollment-card" role="alert">
            <StatusBanner variant="error" title={loadError} />
          </div>
        ) : submitted ? (
          <div className="card public-enrollment-card public-enrollment-card--success">
            <CheckCircle2 size={40} style={{ color: 'var(--success)', marginBottom: 12 }} aria-hidden />
            <h1 className="navi-page-title public-enrollment-title" style={{ fontSize: 22 }}>
              {result?.rescheduled ? 'Horário atualizado!' : 'Experimental agendada!'}
            </h1>
            <p className="text-small" style={{ marginTop: 8, lineHeight: 1.5 }}>
              {result?.message ||
                'A academia entrará em contato para confirmar. Até lá!'}
            </p>
            {result?.scheduledDate ? (
              <p className="text-small text-muted" style={{ marginTop: 12 }}>
                <Calendar size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} aria-hidden />
                {formatSlotDateBr(result.scheduledDate)}
                {result.scheduledTime ? ` às ${result.scheduledTime}` : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <h1 className="navi-page-title public-enrollment-title">
              Agendar aula experimental
            </h1>
            <p className="text-small public-enrollment-subtitle">
              {config?.academyName || 'Academia'}
            </p>

            <form onSubmit={onSubmit} className="public-enrollment-form">
              <div className="card public-enrollment-card">
                <label className="form-group">
                  <span>Nome completo *</span>
                  <input
                    className="form-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    maxLength={120}
                  />
                  {fieldErrors.name ? <FieldError>{fieldErrors.name}</FieldError> : null}
                </label>

                <label className="form-group">
                  <span>WhatsApp / telefone *</span>
                  <input
                    className="form-input"
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    inputMode="tel"
                    autoComplete="tel"
                  />
                  {fieldErrors.phone ? <FieldError>{fieldErrors.phone}</FieldError> : null}
                </label>

                <label className="form-group" style={{ marginBottom: 0 }}>
                  <span>Data de nascimento *</span>
                  <DateInputField value={birthDate} onChange={setBirthDate} />
                  {fieldErrors.birthDate ? <FieldError>{fieldErrors.birthDate}</FieldError> : null}
                  {profileType ? (
                    <p className="text-small text-muted" style={{ marginTop: 6 }}>
                      Faixa: <strong>{profileType}</strong>
                    </p>
                  ) : null}
                </label>
              </div>

              {minorProfile ? (
                <div className="card public-enrollment-card">
                  <label className="form-group" style={{ marginBottom: 0 }}>
                    <span>Nome do responsável *</span>
                    <input
                      className="form-input"
                      value={parentName}
                      onChange={(e) => setParentName(e.target.value)}
                      maxLength={120}
                    />
                    {fieldErrors.parentName ? <FieldError>{fieldErrors.parentName}</FieldError> : null}
                  </label>
                </div>
              ) : null}

              <div className="card public-enrollment-card">
                <h2 className="navi-section-heading" style={{ fontSize: 15, marginBottom: 8 }}>
                  Escolha o horário
                </h2>
                {slotsLoading ? (
                  <p className="text-small text-muted">Carregando horários…</p>
                ) : slotsByDate.length === 0 ? (
                  <StatusBanner
                    variant="warning"
                    title="Nenhum horário disponível no momento"
                    description="Preencha seus dados e enviaremos seu interesse. A recepção entrará em contato para combinar a experimental."
                  />
                ) : (
                  <div className="public-experimental-slots">
                    {slotsByDate.map(([date, daySlots]) => (
                      <div key={date} className="public-experimental-slots__day">
                        <p className="text-small" style={{ fontWeight: 600, marginBottom: 8 }}>
                          {formatSlotDateBr(date)}
                        </p>
                        <div className="public-experimental-slots__list">
                          {daySlots.map((slot) => (
                            <label
                              key={slot.id}
                              className={`public-experimental-slot${slotId === slot.id ? ' public-experimental-slot--selected' : ''}`}
                            >
                              <input
                                type="radio"
                                name="slot"
                                value={slot.id}
                                checked={slotId === slot.id}
                                onChange={() => setSlotId(slot.id)}
                              />
                              <span className="public-experimental-slot__main">
                                <strong>{slot.time_start}</strong>
                                <span className="text-small">{slot.name}</span>
                              </span>
                              <span className="text-small text-muted">{slot.capacity_label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {fieldErrors.slotId ? <FieldError>{fieldErrors.slotId}</FieldError> : null}
              </div>

              {submitError ? (
                <div className="card public-enrollment-card" role="alert">
                  <StatusBanner variant="error" title={submitError} />
                </div>
              ) : null}

              <button type="submit" className="btn-primary public-enrollment-submit" disabled={submitting}>
                {submitting ? 'Agendando…' : slots.length > 0 ? 'Confirmar agendamento' : 'Enviar interesse'}
              </button>
            </form>
          </>
        )}
      </main>
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .public-experimental-slots { display: flex; flex-direction: column; gap: 16px; }
        .public-experimental-slots__list { display: flex; flex-direction: column; gap: 8px; }
        .public-experimental-slot {
          display: flex; align-items: center; gap: 10px; padding: 10px 12px;
          border: 1px solid var(--border-light); border-radius: var(--radius-md);
          cursor: pointer; background: var(--bg);
        }
        .public-experimental-slot--selected {
          border-color: var(--primary); background: var(--primary-subtle, rgba(59,130,246,0.08));
        }
        .public-experimental-slot input { flex-shrink: 0; }
        .public-experimental-slot__main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      `,
        }}
      />
    </div>
  );
}
