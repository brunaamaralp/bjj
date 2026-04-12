import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';

const SEGMENTS = ['Jiu-Jitsu', 'Muay Thai', 'Yoga', 'Pilates', 'Dança', 'Outro'];

const AUDIENCE_OPTIONS = ['Adultos', 'Kids', 'Mulheres', 'Todos'];

const TONE_OPTIONS = ['Amigável', 'Profissional', 'Neutro'];

const TREATMENT_OPTIONS = [
  { value: 'Você', label: 'Você' },
  { value: 'Senhor/Senhora', label: 'Senhor / Senhora' }
];

const PRICE_RESPONSE_OPTIONS = [
  'Informar direto',
  'Convidar para experimental primeiro',
  'Pedir nome antes de informar'
];

const SCHEDULE_OPTIONS = ['Sim, agenda sozinha', 'Não, coleta dados e passa para humano'];

export const WIZARD_AGENTE_EMPTY = {
  academyName: '',
  address: '',
  segment: 'Jiu-Jitsu',
  segmentCustom: '',
  differential: '',
  audience: [],
  freeFirstClass: 'Sim',
  assistantName: '',
  tone: 'Amigável',
  treatment: 'Você',
  priceResponse: 'Convidar para experimental primeiro',
  canSchedule: 'Não, coleta dados e passa para humano',
  neverAnswer: '',
  escalateWhen: '',
  extraInfo: ''
};

/**
 * Monta intro/body/suffix a partir dos dados do wizard (mesma lógica acordada com o produto).
 * @param {Record<string, unknown>} data
 * @returns {{ intro: string, body: string, suffix: string }}
 */
export function buildPromptFromWizard(data) {
  const segmentLabel = data.segment === 'Outro' ? String(data.segmentCustom || '').trim() : String(data.segment || '').trim();

  const assistantLine = String(data.assistantName || '').trim()
    ? `Você se chama ${String(data.assistantName).trim()} e é`
    : 'Você é';

  const toneLine =
    {
      Amigável: 'Seu tom é amigável, acolhedor e próximo.',
      Profissional: 'Seu tom é profissional e objetivo.',
      Neutro: 'Seu tom é neutro e informativo.'
    }[data.tone] || '';

  const treatmentLine =
    data.treatment === 'Você'
      ? 'Trate o cliente como "você".'
      : 'Trate o cliente como "senhor" ou "senhora".';

  const aud = Array.isArray(data.audience) ? data.audience.filter(Boolean) : [];
  const audienceLabel = aud.length > 0 ? aud.join(', ') : 'Não especificado';

  const freeClass = data.freeFirstClass === 'Sim' ? 'A primeira aula é gratuita e sem compromisso.' : '';

  const priceLines =
    {
      'Informar direto': 'Quando perguntarem sobre preços, informe diretamente.',
      'Convidar para experimental primeiro':
        'Quando perguntarem sobre preços, convide primeiro para uma aula experimental gratuita antes de informar valores.',
      'Pedir nome antes de informar':
        'Quando perguntarem sobre preços, pergunte o nome do cliente antes de informar valores.'
    }[data.priceResponse] || '';

  const scheduleLine =
    data.canSchedule === 'Sim, agenda sozinha'
      ? 'Você pode agendar aulas experimentais diretamente na conversa.'
      : 'Você não agenda aulas diretamente. Colete nome e telefone e informe que um responsável entrará em contato.';

  const academyName = String(data.academyName || '').trim();
  const intro = [
    `${assistantLine} atendente da ${academyName || 'academia'}, uma academia de ${segmentLabel || 'atividades'}.`,
    toneLine,
    treatmentLine
  ]
    .filter(Boolean)
    .join(' ');

  const body = [
    data.extraInfo ? `INFORMAÇÕES DA ACADEMIA:\n${String(data.extraInfo).trim()}` : '',
    data.address ? `LOCALIZAÇÃO:\n${String(data.address).trim()}` : '',
    freeClass,
    `PÚBLICO: ${audienceLabel}`,
    data.differential ? `DIFERENCIAIS: ${String(data.differential).trim()}` : '',
    '',
    'FLUXO DE ATENDIMENTO:',
    priceLines,
    scheduleLine
  ]
    .filter(Boolean)
    .join('\n');

  const suffix = [
    data.neverAnswer ? `NUNCA responda sobre:\n${String(data.neverAnswer).trim()}` : '',
    data.escalateWhen ? `Passe imediatamente para um humano quando:\n${String(data.escalateWhen).trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  return { intro, body, suffix };
}

function mergeWizardInitial(saved) {
  if (!saved || typeof saved !== 'object') return { ...WIZARD_AGENTE_EMPTY };
  const next = { ...WIZARD_AGENTE_EMPTY };
  for (const k of Object.keys(WIZARD_AGENTE_EMPTY)) {
    if (k === 'audience' && Array.isArray(saved.audience)) {
      next.audience = saved.audience.filter((x) => typeof x === 'string');
    } else if (saved[k] !== undefined && saved[k] !== null) {
      next[k] = saved[k];
    }
  }
  return next;
}

/**
 * @param {{
 *   isOpen: boolean;
 *   onClose: () => void;
 *   onComplete: (intro: string, body: string, suffix: string, wizardPayload: object) => void;
 *   initialData: object | null;
 *   getJwt: () => Promise<string>;
 *   academyId: string;
 * }} props
 */
export default function WizardAgente({ isOpen, onClose, onComplete, initialData, getJwt, academyId }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => ({ ...WIZARD_AGENTE_EMPTY }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const mergedKey = useMemo(() => (initialData && typeof initialData === 'object' ? JSON.stringify(initialData) : ''), [initialData]);

  useEffect(() => {
    if (!isOpen) return;
    setForm(mergeWizardInitial(initialData));
    setStep(1);
    setError('');
  }, [isOpen, mergedKey, initialData]);

  const update = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  }, []);

  const toggleAudience = useCallback((label) => {
    setForm((prev) => {
      const cur = Array.isArray(prev.audience) ? [...prev.audience] : [];
      const i = cur.indexOf(label);
      if (i >= 0) cur.splice(i, 1);
      else cur.push(label);
      return { ...prev, audience: cur };
    });
  }, []);

  const validateStep1 = useCallback(() => {
    if (!String(form.academyName || '').trim()) return 'Informe o nome da academia.';
    if (!String(form.address || '').trim()) return 'Informe o endereço e como chegar.';
    if (form.segment === 'Outro' && !String(form.segmentCustom || '').trim()) return 'Descreva o segmento em "Outro".';
    return '';
  }, [form.academyName, form.address, form.segment, form.segmentCustom]);

  const goNext = useCallback(() => {
    if (step === 1) {
      const msg = validateStep1();
      if (msg) {
        setError(msg);
        return;
      }
    }
    setError('');
    setStep((s) => Math.min(3, s + 1));
  }, [step, validateStep1]);

  const goBack = useCallback(() => {
    setError('');
    setStep((s) => Math.max(1, s - 1));
  }, []);

  const handleGenerate = useCallback(async () => {
    const msg = validateStep1();
    if (msg) {
      setError(msg);
      setStep(1);
      return;
    }
    const id = String(academyId || '').trim();
    if (!id) {
      setError('Academia não selecionada.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const wizardData = {
        academyName: String(form.academyName || '').trim(),
        address: String(form.address || '').trim(),
        segment: form.segment,
        segmentCustom: String(form.segmentCustom || '').trim(),
        differential: String(form.differential || '').trim(),
        audience: Array.isArray(form.audience) ? form.audience : [],
        freeFirstClass: form.freeFirstClass,
        assistantName: String(form.assistantName || '').trim(),
        tone: form.tone,
        treatment: form.treatment,
        priceResponse: form.priceResponse,
        canSchedule: form.canSchedule,
        neverAnswer: String(form.neverAnswer || '').trim(),
        escalateWhen: String(form.escalateWhen || '').trim(),
        extraInfo: String(form.extraInfo || '').trim(),
        savedAt: new Date().toISOString()
      };
      const json = JSON.stringify(wizardData);
      if (json.length > 10000) {
        setError('Os dados do wizard excedem o limite de 10.000 caracteres. Reduza textos longos.');
        return;
      }
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': id
        },
        body: JSON.stringify({ action: 'save_wizard_data', wizard_data: json })
      });
      if (blocked) return;
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.sucesso) {
        throw new Error(data?.erro || 'Não foi possível salvar o assistente guiado');
      }
      const { intro, body, suffix } = buildPromptFromWizard(wizardData);
      onComplete(intro, body, suffix, wizardData);
    } catch (e) {
      setError(e?.message || 'Erro ao gerar prompt');
    } finally {
      setSaving(false);
    }
  }, [academyId, form, getJwt, onComplete, validateStep1]);

  if (!isOpen) return null;

  return (
    <div
      className="wizard-agente-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-agente-title"
      onClick={onClose}
    >
      <div className="wizard-agente-panel" onClick={(e) => e.stopPropagation()}>
        <div className="wizard-agente-head">
          <h2 id="wizard-agente-title" className="navi-section-heading" style={{ fontSize: '1.1rem', margin: 0 }}>
            Configurar com perguntas guiadas
          </h2>
          <button type="button" className="btn btn-outline" style={{ padding: '4px 12px' }} onClick={onClose}>
            Fechar
          </button>
        </div>
        <p className="agent-subtitle" style={{ margin: '0 0 12px' }}>
          Passo {step} de 3
          {step === 1 ? ' — O negócio' : step === 2 ? ' — Fluxo comercial' : ' — Regras'}
        </p>
        {error ? (
          <div className="agent-warning" style={{ marginBottom: 12 }}>
            {error}
          </div>
        ) : null}

        {step === 1 && (
          <div className="wizard-agente-body">
            <div className="agent-field">
              <label htmlFor="wa-academy-name">Nome da academia *</label>
              <input
                id="wa-academy-name"
                className="form-input"
                value={form.academyName}
                onChange={(e) => update({ academyName: e.target.value })}
                placeholder="Ex.: Estúdio Centro"
              />
            </div>
            <div className="agent-field">
              <label htmlFor="wa-address">Endereço e como chegar *</label>
              <textarea
                id="wa-address"
                className="agent-field-textarea input"
                rows={4}
                value={form.address}
                onChange={(e) => update({ address: e.target.value })}
                placeholder="Rua, número, bairro, referências, estacionamento…"
              />
            </div>
            <div className="agent-field">
              <label htmlFor="wa-segment">Segmento</label>
              <select id="wa-segment" className="form-input" value={form.segment} onChange={(e) => update({ segment: e.target.value })}>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            {form.segment === 'Outro' && (
              <div className="agent-field">
                <label htmlFor="wa-segment-custom">Descreva o segmento *</label>
                <input
                  id="wa-segment-custom"
                  className="form-input"
                  value={form.segmentCustom}
                  onChange={(e) => update({ segmentCustom: e.target.value })}
                  placeholder="Ex.: CrossFit, natação…"
                />
              </div>
            )}
            <div className="agent-field">
              <label htmlFor="wa-diff">O que torna a academia única</label>
              <textarea
                id="wa-diff"
                className="agent-field-textarea input"
                rows={3}
                value={form.differential}
                onChange={(e) => update({ differential: e.target.value })}
                placeholder="Diferenciais, método, equipe…"
              />
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Público (marque um ou mais)</span>
              <div className="wizard-agente-checks">
                {AUDIENCE_OPTIONS.map((opt) => (
                  <label key={opt} className="wizard-agente-check">
                    <input type="checkbox" checked={form.audience.includes(opt)} onChange={() => toggleAudience(opt)} />
                    <span>{opt}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Primeira aula gratuita?</span>
              <div className="wizard-agente-radios">
                <label className="wizard-agente-check">
                  <input type="radio" name="wa-free" checked={form.freeFirstClass === 'Sim'} onChange={() => update({ freeFirstClass: 'Sim' })} />
                  <span>Sim</span>
                </label>
                <label className="wizard-agente-check">
                  <input type="radio" name="wa-free" checked={form.freeFirstClass === 'Não'} onChange={() => update({ freeFirstClass: 'Não' })} />
                  <span>Não</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-agente-body">
            <div className="agent-field">
              <label htmlFor="wa-assistant">Nome do assistente (opcional)</label>
              <input
                id="wa-assistant"
                className="form-input"
                value={form.assistantName}
                onChange={(e) => update({ assistantName: e.target.value })}
                placeholder="Ex.: assistente virtual"
              />
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Tom</span>
              <div className="wizard-agente-radios wizard-agente-radios--col">
                {TONE_OPTIONS.map((t) => (
                  <label key={t} className="wizard-agente-check">
                    <input type="radio" name="wa-tone" checked={form.tone === t} onChange={() => update({ tone: t })} />
                    <span>{t}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Tratamento</span>
              <div className="wizard-agente-radios">
                {TREATMENT_OPTIONS.map((o) => (
                  <label key={o.value} className="wizard-agente-check">
                    <input
                      type="radio"
                      name="wa-treat"
                      checked={form.treatment === o.value}
                      onChange={() => update({ treatment: o.value })}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Quando falarem de preço</span>
              <div className="wizard-agente-radios wizard-agente-radios--col">
                {PRICE_RESPONSE_OPTIONS.map((p) => (
                  <label key={p} className="wizard-agente-check">
                    <input type="radio" name="wa-price" checked={form.priceResponse === p} onChange={() => update({ priceResponse: p })} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="agent-field">
              <span className="agent-field-label-block">Agendamento de experimental</span>
              <div className="wizard-agente-radios wizard-agente-radios--col">
                {SCHEDULE_OPTIONS.map((p) => (
                  <label key={p} className="wizard-agente-check">
                    <input type="radio" name="wa-sched" checked={form.canSchedule === p} onChange={() => update({ canSchedule: p })} />
                    <span>{p}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-agente-body">
            <div className="agent-field">
              <label htmlFor="wa-never">O que nunca responder</label>
              <textarea
                id="wa-never"
                className="agent-field-textarea input"
                rows={3}
                value={form.neverAnswer}
                onChange={(e) => update({ neverAnswer: e.target.value })}
                placeholder="Ex.: assuntos jurídicos, saúde sem responsável…"
              />
            </div>
            <div className="agent-field">
              <label htmlFor="wa-escalate">Quando passar imediatamente para humano</label>
              <textarea
                id="wa-escalate"
                className="agent-field-textarea input"
                rows={3}
                value={form.escalateWhen}
                onChange={(e) => update({ escalateWhen: e.target.value })}
                placeholder="Ex.: cancelamento, reembolso, reclamação grave…"
              />
            </div>
            <div className="agent-field">
              <label htmlFor="wa-extra">Informações extras (horários, planos, preços, uniforme…)</label>
              <textarea
                id="wa-extra"
                className="agent-field-textarea input"
                rows={8}
                value={form.extraInfo}
                onChange={(e) => update({ extraInfo: e.target.value })}
                placeholder="Cole ou digite tudo que a IA deve saber sobre a operação da academia."
              />
            </div>
          </div>
        )}

        <div className="wizard-agente-footer">
          <button type="button" className="btn btn-outline" onClick={goBack} disabled={step <= 1 || saving}>
            Voltar
          </button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {step < 3 ? (
              <button type="button" className="btn btn-primary" onClick={goNext} disabled={saving}>
                Próximo
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => void handleGenerate()} disabled={saving}>
                {saving ? 'Gerando…' : 'Gerar prompt'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
