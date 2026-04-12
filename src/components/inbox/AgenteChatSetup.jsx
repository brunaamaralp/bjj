import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';

export const SYSTEM_RULES = `
REGRAS OBRIGATÓRIAS DO SISTEMA:
- Sempre use o primeiro nome do contato quando disponível no cadastro
- NUNCA dê orientações financeiras, jurídicas ou médicas
- NUNCA faça promessas de resultados garantidos
- NUNCA compartilhe dados ou informações de outros clientes
- Responda sempre em português brasileiro
- Se perguntado se é uma IA, desvie com naturalidade 
- Nunca invente informações — se não souber, diga que vai verificar
`.trim();

const STEPS = [
  { id: 'academyName', block: 1, type: 'text' },
  { id: 'segment', block: 1, type: 'chips-multi' },
  { id: 'assistantName', block: 1, type: 'text-optional' },
  { id: 'tone', block: 1, type: 'chips-single' },
  { id: 'address', block: 1, type: 'textarea' },
  { id: 'gradeHorarios', block: 2, type: 'textarea-grade' },
  { id: 'plans', block: 3, type: 'chips-multi' },
  { id: 'planPrices', block: 3, type: 'currency-per-item' },
  { id: 'enrollment', block: 3, type: 'yes-no-value' },
  { id: 'discount', block: 3, type: 'yes-no-text' },
  { id: 'uniform', block: 4, type: 'chips-single' },
  { id: 'uniformDetails', block: 4, type: 'textarea-conditional' },
  { id: 'uniformLoan', block: 4, type: 'chips-single' },
  { id: 'amenities', block: 4, type: 'chips-multi' },
  { id: 'trial', block: 5, type: 'chips-single' },
  { id: 'trialDetails', block: 5, type: 'chips-multi-conditional' },
  { id: 'priceFlow', block: 5, type: 'chips-single' },
  { id: 'scheduling', block: 5, type: 'chips-single' },
  { id: 'neverDo', block: 6, type: 'textarea-optional' },
  { id: 'escalate', block: 6, type: 'textarea-optional' }
];

export const AGENTE_CHAT_STEP_COUNT = STEPS.length;

const SEGMENT_OPTS = ['Jiu-Jitsu', 'Muay Thai', 'Yoga', 'Pilates', 'Dança', 'CrossFit', 'Musculação', 'Outro'];
const TONE_OPTS = ['Amigável', 'Profissional', 'Neutro', 'Descontraído'];
const PLAN_OPTS = ['Mensal', 'Trimestral', 'Semestral', 'Anual', 'Experimental'];

const GRADE_HORARIOS_PLACEHOLDER = `Cole ou escreva sua grade de horários aqui. Exemplo:
Adulto
Segunda e Quarta: 19h10 | Sexta: 20h00
Sábado: 10h00
Kids (5 a 9 anos)
Terça e Quinta: 17h30
Juniores (10 a 15 anos)
Terça e Quinta: 18h20 | Sábado: 09h00
Feminina
Segunda e Quarta: 20h00`;
const UNIFORM_OPTS = ['Kimono obrigatório', 'Roupa esportiva livre', 'Kimono ou rashguard', 'Não se aplica'];
const UNIFORM_LOAN_OPTS = ['Sim', 'Não', 'Sob consulta'];
const AMENITY_OPTS = ['Estacionamento', 'Vestiário', 'Loja', 'Ar condicionado', 'Bebedouro', 'Wi‑Fi'];
const TRIAL_OPTS = ['Sim, gratuita', 'Sim, valor simbólico', 'Não oferecemos'];
const TRIAL_DETAIL_OPTS = ['Agendamento com humano', 'Walk-in permitido', 'Só horários fixos', 'Combo com avaliação'];
const PRICE_FLOW_OPTS = ['Informar direto', 'Experimental primeiro', 'Pedir nome antes'];
const SCHEDULING_OPTS = ['A IA pode agendar', 'Coleta dados e passa para humano'];

function legacyScheduleToGradeHorarios(a) {
  const cls = Array.isArray(a?.classes) ? a.classes : [];
  const cs = a?.classSchedules && typeof a.classSchedules === 'object' ? a.classSchedules : {};
  const lines = [];
  const seen = new Set();
  for (const c of cls) {
    const key = String(c || '').trim();
    if (!key) continue;
    seen.add(key);
    const h = String(cs[key] || '').trim();
    lines.push(h ? `${key}\n${h}` : key);
  }
  for (const k of Object.keys(cs)) {
    if (seen.has(k)) continue;
    const h = String(cs[k] || '').trim();
    if (h) lines.push(`${k}\n${h}`);
  }
  return lines.join('\n\n').trim();
}

/** Respostas salvas antes do passo único de grade: classes + classSchedules. */
function answersLookLegacy(savedAnswers) {
  if (!savedAnswers || typeof savedAnswers !== 'object') return false;
  return (
    Object.prototype.hasOwnProperty.call(savedAnswers, 'classes') ||
    Object.prototype.hasOwnProperty.call(savedAnswers, 'classSchedules')
  );
}

/** Após remover um passo do fluxo, remapeia índice salvo no formato antigo. */
function remapLegacyWizardStep(oldStep) {
  if (typeof oldStep !== 'number' || Number.isNaN(oldStep)) return oldStep;
  if (oldStep <= 4) return oldStep;
  if (oldStep <= 6) return oldStep;
  return oldStep - 1;
}

function normalizeWizardAnswersShape(merged) {
  if (!merged || typeof merged !== 'object') return merged;
  const out = { ...merged };
  const grade = String(out.gradeHorarios || '').trim();
  if (!grade && answersLookLegacy(out)) {
    const migrated = legacyScheduleToGradeHorarios(out);
    if (migrated) out.gradeHorarios = migrated;
    else out.gradeHorarios = '';
  }
  delete out.classes;
  delete out.classSchedules;
  return out;
}

function emptyAnswers() {
  return {
    academyName: '',
    segment: [],
    assistantName: '',
    tone: '',
    address: '',
    gradeHorarios: '',
    plans: [],
    planPrices: {},
    enrollment: { has: false, value: '' },
    discount: { has: false, text: '' },
    uniform: '',
    uniformDetails: '',
    uniformLoan: '',
    amenities: [],
    trial: '',
    trialDetails: [],
    priceFlow: '',
    scheduling: '',
    neverDo: '',
    escalate: ''
  };
}

function mergeResumeAnswers(savedAnswers) {
  const e = emptyAnswers();
  const a = savedAnswers && typeof savedAnswers === 'object' ? savedAnswers : null;
  if (!a) return e;
  const base = {
    ...e,
    ...a,
    segment: Array.isArray(a.segment) ? a.segment : e.segment,
    plans: Array.isArray(a.plans) ? a.plans : e.plans,
    amenities: Array.isArray(a.amenities) ? a.amenities : e.amenities,
    trialDetails: Array.isArray(a.trialDetails) ? a.trialDetails : e.trialDetails,
    planPrices: { ...e.planPrices, ...(a.planPrices && typeof a.planPrices === 'object' ? a.planPrices : {}) },
    enrollment: { ...e.enrollment, ...(a.enrollment && typeof a.enrollment === 'object' ? a.enrollment : {}) },
    discount: { ...e.discount, ...(a.discount && typeof a.discount === 'object' ? a.discount : {}) }
  };
  return normalizeWizardAnswersShape(base);
}

function shouldSkipStepId(id, a) {
  if (id === 'uniformDetails' || id === 'uniformLoan') {
    const u = String(a.uniform || '');
    return !u || u === 'Não se aplica';
  }
  if (id === 'trialDetails') {
    const t = String(a.trial || '');
    return !t || t === 'Não oferecemos';
  }
  return false;
}

function advanceFrom(currentIndex, merged) {
  let n = currentIndex + 1;
  while (n < STEPS.length && shouldSkipStepId(STEPS[n].id, merged)) {
    n += 1;
  }
  return n;
}

function parseWizardSaved(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.step !== 'number' || !raw.answers || typeof raw.answers !== 'object') return null;
  let step = raw.step;
  if (answersLookLegacy(raw.answers)) {
    step = remapLegacyWizardStep(step);
  }
  if (step < 0 || step > STEPS.length) return null;
  return { step, answers: raw.answers, savedAt: raw.savedAt };
}

function mergeAnswers(base, patch) {
  return { ...base, ...patch };
}

function summarizePatch(patch) {
  const [k, v] = Object.entries(patch)[0] || [];
  if (v === undefined) return '(ok)';
  if (Array.isArray(v)) return v.join(', ') || '(ok)';
  if (v && typeof v === 'object') {
    if (k === 'enrollment') return v.has ? `Sim — ${v.value || 'valor'}` : 'Não';
    if (k === 'discount') return v.has ? String(v.text || '') : 'Não';
    if (k === 'planPrices') {
      return Object.entries(v)
        .map(([a, b]) => `${a}: ${b}`)
        .join('; ');
    }
    return JSON.stringify(v);
  }
  if (k === 'gradeHorarios') {
    const t = String(v || '').trim();
    if (!t) return '(grade vazia)';
    return t.length > 100 ? `${t.slice(0, 97)}…` : t;
  }
  return String(v);
}

const GEN_SYSTEM = `Você é especialista em criar prompts para
assistentes de WhatsApp de academias e estúdios fitness.
Crie instruções claras e naturais em português brasileiro.
O assistente deve soar humano, não robótico.

Retorne APENAS JSON válido neste formato, sem markdown:
{
  "intro": "quem é o assistente, tom, como se apresentar",
  "body": "todas as informações da academia organizadas claramente"
}`;

function buildUserContentForGen(answers) {
  const a = answers;
  return `
Academia: ${a.academyName}
Segmento: ${Array.isArray(a.segment) ? a.segment.join(', ') : a.segment}
Nome do assistente: ${a.assistantName || 'não definido'}
Tom: ${a.tone}
Endereço: ${a.address}

TURMAS E HORÁRIOS:
${String(a.gradeHorarios || '').trim() || '(não informado)'}

PLANOS E PREÇOS:
${Object.entries(a.planPrices || {})
  .map(([plano, valor]) => `${plano}: ${valor}`)
  .join('\n')}
Matrícula: ${a.enrollment?.has ? 'R$' + a.enrollment.value : 'Não cobra'}
Desconto: ${a.discount?.has ? a.discount.text : 'Não informado'}

UNIFORME: ${a.uniform}
${a.uniformDetails || ''}
Empréstimo/aluguel: ${a.uniformLoan}

COMODIDADES: ${Array.isArray(a.amenities) ? a.amenities.join(', ') : 'não informado'}

EXPERIMENTAL: ${a.trial}
${Array.isArray(a.trialDetails) && a.trialDetails.length ? 'Detalhes: ' + a.trialDetails.join(', ') : ''}
Fluxo de preço: ${a.priceFlow}
Agendamento: ${a.scheduling}

REGRAS ESPECIAIS: ${a.neverDo || 'nenhuma'}
ESCALAR PARA HUMANO: ${a.escalate || 'não definido'}
`.trim();
}

function stepPrompt(stepId) {
  const map = {
    academyName: 'Como se chama sua academia ou estúdio?',
    segment: 'Quais segmentos descrevem melhor o seu negócio? (pode marcar vários)',
    assistantName: 'Quer dar um nome ao assistente virtual? (opcional)',
    tone: 'Qual tom de voz o assistente deve usar?',
    address: 'Endereço e como chegar (referências, estacionamento, etc.)',
    gradeHorarios: `Turmas e horários

Cole ou descreva sua grade completa em um único bloco. Você pode organizar por turma, dia ou como costuma divulgar.`,
    plans: 'Quais planos ou pacotes o cliente pode contratar?',
    planPrices: 'Informe o valor de cada plano (texto livre, ex.: R$ 199/mês).',
    enrollment: 'Há taxa de matrícula? Se sim, qual o valor?',
    discount: 'Oferece desconto para família, anuidade ou promoções? Descreva se houver.',
    uniform: 'Como funciona o uniforme na academia?',
    uniformDetails: 'Detalhes do uniforme (cores, modelos, onde comprar…)',
    uniformLoan: 'Há empréstimo ou aluguel de kimono para experimental?',
    amenities: 'Quais comodidades você quer destacar?',
    trial: 'Como funciona a aula experimental?',
    trialDetails: 'Detalhes do experimental (o que marcar faz sentido para você)',
    priceFlow: 'Quando o cliente perguntar preço, qual deve ser o fluxo?',
    scheduling: 'O assistente pode agendar ou só coleta dados?',
    neverDo: 'Algo que o assistente nunca deve fazer ou dizer? (opcional)',
    escalate: 'Em quais situações deve passar para um humano? (opcional)'
  };
  return map[stepId] || stepId;
}

/**
 * @param {{
 *   academyId: string;
 *   academyDoc?: Record<string, unknown>;
 *   getJwt: () => Promise<string>;
 *   wizardInitial: object | null;
 *   loading?: boolean;
 *   onComplete: (p: { intro: string; body: string; suffix: string; wizardPayload?: object }) => void | Promise<void>;
 *   onWizardReset?: () => void;
 * }} props
 */
export default function AgenteChatSetup({ academyId, getJwt, wizardInitial, loading = false, onComplete, onWizardReset }) {
  const messagesScrollRef = useRef(null);
  const messagesEndRef = useRef(null);
  const resumeDataRef = useRef(null);
  const lastInitKeyRef = useRef('');
  const startFlowRef = useRef(() => {});

  const [messages, setMessages] = useState([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState(() => emptyAnswers());
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [started, setStarted] = useState(false);

  const [textDraft, setTextDraft] = useState('');
  const [multiSel, setMultiSel] = useState([]);
  const [priceDraft, setPriceDraft] = useState({});
  const [enrollYes, setEnrollYes] = useState(null);
  const [enrollVal, setEnrollVal] = useState('');
  const [discYes, setDiscYes] = useState(null);
  const [discText, setDiscText] = useState('');

  const scrollBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const box = messagesScrollRef.current;
      if (box) {
        box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
        return;
      }
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    });
  }, []);

  useEffect(() => {
    scrollBottom();
  }, [messages, generating, scrollBottom]);

  const saveProgress = useCallback(
    async (newAnswers, newStep) => {
      const id = String(academyId || '').trim();
      if (!id) return;
      const payload = {
        step: newStep,
        answers: newAnswers,
        savedAt: new Date().toISOString()
      };
      const json = JSON.stringify(payload);
      if (json.length > 10000) {
        console.error('[AgenteChatSetup] wizard_data excede 10k');
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
        console.error('[AgenteChatSetup] save_wizard_data', data?.erro);
      }
    },
    [academyId, getJwt]
  );

  const pushNave = useCallback((content, actions) => {
    setMessages((m) => [...m, { role: 'nave', content, actions }]);
  }, []);

  const pushUser = useCallback((content) => {
    setMessages((m) => [...m, { role: 'user', content }]);
  }, []);

  const currentStep = STEPS[stepIndex];

  const syncDraftsForStep = useCallback(
    (idx, ans) => {
      const s = STEPS[idx];
      if (!s) return;
      setTextDraft('');
      if (s.id === 'planPrices') {
        const next = {};
        for (const p of ans.plans || []) {
          next[p] = String(ans.planPrices?.[p] || '');
        }
        setPriceDraft(next);
      }
      if (s.id === 'enrollment') {
        const h = ans.enrollment?.has;
        setEnrollYes(h === true ? true : h === false ? false : null);
        setEnrollVal(String(ans.enrollment?.value || ''));
      }
      if (s.id === 'discount') {
        setDiscYes(ans.discount?.has ? true : ans.discount?.has === false ? false : null);
        setDiscText(String(ans.discount?.text || ''));
      }
      if (s.type === 'chips-multi' || s.type === 'chips-multi-conditional') {
        const key = s.id;
        const cur = ans[key];
        setMultiSel(Array.isArray(cur) ? [...cur] : []);
      }
      if (
        s.type === 'text' ||
        s.type === 'textarea' ||
        s.type === 'textarea-grade' ||
        s.type === 'text-optional' ||
        s.type === 'textarea-optional' ||
        s.type === 'textarea-conditional'
      ) {
        setTextDraft(String(ans[s.id] || ''));
      }
    },
    []
  );

  const askStep = useCallback(
    (idx, ans) => {
      const s = STEPS[idx];
      if (!s) return;
      pushNave(stepPrompt(s.id));
      syncDraftsForStep(idx, ans);
    },
    [pushNave, syncDraftsForStep]
  );

  const startFlow = useCallback(() => {
    setStarted(true);
    setDone(false);
    setResuming(false);
    setStepIndex(0);
    const fresh = emptyAnswers();
    setAnswers(fresh);
    setMessages([]);
    askStep(0, fresh);
  }, [askStep]);

  startFlowRef.current = startFlow;

  const resume = useCallback(
    (saved) => {
      const merged = mergeResumeAnswers(saved?.answers || {});
      let step = typeof saved?.step === 'number' ? saved.step : 0;
      step = Math.max(0, Math.min(step, STEPS.length - 1));
      setAnswers(merged);
      setStepIndex(step);
      setStarted(true);
      setDone(false);
      setResuming(false);
      setMessages([{ role: 'nave', content: 'Vamos continuar de onde você parou.' }]);
      if (step < STEPS.length) {
        askStep(step, merged);
      }
    },
    [askStep]
  );

  const restart = useCallback(async () => {
    const fresh = emptyAnswers();
    await saveProgress(fresh, 0);
    lastInitKeyRef.current = '';
    if (onWizardReset) onWizardReset();
    else startFlow();
  }, [saveProgress, startFlow, onWizardReset]);

  const runGenerate = useCallback(
    async (finalAnswers) => {
      setGenerating(true);
      const userContent = buildUserContentForGen(finalAnswers);
      try {
        const jwt = await getJwt();
        const res = await fetch('/api/generate-prompt', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': String(academyId || '').trim()
          },
          body: JSON.stringify({
            system: GEN_SYSTEM,
            userContent
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.erro || data.error || 'Falha ao gerar');

        const blocks = Array.isArray(data.content) ? data.content : [];
        const text = blocks
          .filter((b) => b && b.type === 'text')
          .map((b) => String(b.text || ''))
          .join('\n')
          .trim();
        const clean = text.replace(/```json|```/g, '').trim();
        let parsed;
        try {
          parsed = JSON.parse(clean);
        } catch {
          throw new Error('Resposta da IA não é JSON válido');
        }
        const intro = String(parsed.intro || '').trim();
        const body = String(parsed.body || '').trim();
        const suffix = SYSTEM_RULES;

        const completedPayload = {
          step: STEPS.length,
          answers: finalAnswers,
          savedAt: new Date().toISOString(),
          completed: true
        };
        const id = String(academyId || '').trim();
        if (id) {
          const json = JSON.stringify(completedPayload);
          if (json.length <= 10000) {
            const jwt2 = await getJwt();
            const { blocked: bl2, res: r2 } = await fetchWithBillingGuard('/api/settings/ai-prompt', {
              method: 'PATCH',
              headers: {
                'content-type': 'application/json',
                Authorization: `Bearer ${jwt2}`,
                'x-academy-id': id
              },
              body: JSON.stringify({ action: 'save_wizard_data', wizard_data: json })
            });
            if (bl2) return;
            await r2.text().catch(() => '');
          }
        }

        await onComplete({ intro, body, suffix, wizardPayload: completedPayload });
        setDone(true);
        pushNave('Pronto! Suas instruções foram geradas e salvas.');
      } catch (err) {
        console.error('[AgenteChatSetup] erro ao gerar prompt:', err);
        pushNave(
          'Não foi possível gerar o prompt agora. Tente de novo em instantes.'
        );
      } finally {
        setGenerating(false);
      }
    },
    [academyId, getJwt, onComplete, pushNave, saveProgress]
  );

  const commitAndAdvance = useCallback(
    async (patch) => {
      const merged = mergeAnswers(answers, patch);
      setAnswers(merged);
      pushUser(summarizePatch(patch));

      const next = advanceFrom(stepIndex, merged);
      await saveProgress(merged, next);
      setStepIndex(next);

      if (next >= STEPS.length) {
        await runGenerate(merged);
      } else {
        askStep(next, merged);
      }
    },
    [answers, askStep, pushUser, runGenerate, saveProgress, stepIndex]
  );

  const handleTextSend = useCallback(async () => {
    if (!currentStep) return;
    const v = textDraft.trim();
    if (currentStep.type !== 'text-optional' && currentStep.type !== 'textarea-optional' && !v) return;
    if (currentStep.id === 'academyName' && !v) return;
    if (currentStep.id === 'address' && !v) return;
    if (currentStep.id === 'gradeHorarios' && !v) return;
    await commitAndAdvance({ [currentStep.id]: v });
    setTextDraft('');
  }, [commitAndAdvance, currentStep, textDraft]);

  const handleChipSingle = useCallback(
    async (value) => {
      if (!currentStep) return;
      await commitAndAdvance({ [currentStep.id]: value });
    },
    [commitAndAdvance, currentStep]
  );

  const handleMultiConfirm = useCallback(async () => {
    if (!currentStep) return;
    const need = currentStep.id === 'segment' || currentStep.id === 'plans';
    if (need && multiSel.length === 0) return;
    await commitAndAdvance({ [currentStep.id]: [...multiSel] });
  }, [commitAndAdvance, currentStep, multiSel]);

  const handlePricesSend = useCallback(async () => {
    await commitAndAdvance({ planPrices: { ...priceDraft } });
  }, [commitAndAdvance, priceDraft]);

  const handleEnrollmentSend = useCallback(async () => {
    if (enrollYes === null) return;
    await commitAndAdvance({
      enrollment: { has: enrollYes === true, value: enrollYes ? enrollVal.trim() : '' }
    });
  }, [commitAndAdvance, enrollYes, enrollVal]);

  const handleDiscountSend = useCallback(async () => {
    if (discYes === null) return;
    await commitAndAdvance({
      discount: { has: discYes === true, text: discYes ? discText.trim() : '' }
    });
  }, [commitAndAdvance, discYes, discText]);

  const toggleMulti = useCallback((opt) => {
    setMultiSel((prev) => {
      const i = prev.indexOf(opt);
      if (i >= 0) return prev.filter((x) => x !== opt);
      return [...prev, opt];
    });
  }, []);

  const wizardKey = useMemo(() => JSON.stringify(wizardInitial ?? null), [wizardInitial]);

  useEffect(() => {
    if (loading) {
      lastInitKeyRef.current = '';
      return;
    }

    const initKey = `${academyId}:${wizardKey}`;
    if (lastInitKeyRef.current === initKey) return;
    lastInitKeyRef.current = initKey;

    const parsed = parseWizardSaved(wizardInitial);
    resumeDataRef.current = parsed;

    if (parsed && parsed.step >= STEPS.length) {
      setDone(true);
      setStarted(true);
      setResuming(false);
      setStepIndex(STEPS.length);
      setMessages([
        {
          role: 'nave',
          content: 'Seu assistente já foi configurado com este fluxo. Quer reconfigurar do zero?',
          actions: [{ label: 'Reconfigurar', action: () => restart() }]
        }
      ]);
      return;
    }

    if (parsed && parsed.step > 0 && parsed.step < STEPS.length) {
      setResuming(true);
      setStarted(false);
      setDone(false);
      setStepIndex(0);
      setMessages([
        {
          role: 'nave',
          content: `Você tem uma configuração em andamento (passo ${parsed.step + 1} de ${STEPS.length}). Quer retomar de onde parou?`,
          actions: [
            { label: '▶ Retomar', action: () => resume(resumeDataRef.current) },
            { label: 'Começar do zero', action: () => restart() }
          ]
        }
      ]);
      return;
    }

    startFlowRef.current();
  }, [loading, wizardKey, wizardInitial, academyId, resume, restart]);

  const progressPct = useMemo(
    () => (started && !done ? ((stepIndex + 1) / STEPS.length) * 100 : done ? 100 : 0),
    [started, done, stepIndex]
  );

  function renderCurrentInput() {
    if (loading || !started || done || generating || resuming || !currentStep) return null;

    const s = currentStep;

    if (s.type === 'textarea-grade') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
          <label className="agent-field-label-block" htmlFor="agent-grade-horarios" style={{ margin: 0 }}>
            Grade de horários
          </label>
          <textarea
            id="agent-grade-horarios"
            className="agent-chat-input"
            rows={12}
            style={{
              resize: 'vertical',
              minHeight: '12rem',
              width: '100%',
              boxSizing: 'border-box',
              fontFamily: 'inherit',
              lineHeight: 1.45
            }}
            value={textDraft}
            onChange={(e) => setTextDraft(e.target.value)}
            placeholder={GRADE_HORARIOS_PLACEHOLDER}
          />
          <button type="button" className="agent-chat-send" style={{ alignSelf: 'flex-start' }} onClick={() => void handleTextSend()}>
            Enviar
          </button>
        </div>
      );
    }

    if (s.type === 'text' || s.type === 'text-optional' || s.type === 'textarea' || s.type === 'textarea-optional' || s.type === 'textarea-conditional') {
      const rows = s.type === 'text' || s.type === 'text-optional' ? 1 : 4;
      const optional = s.type.includes('optional') || s.type === 'textarea-conditional';
      return (
        <div className="agent-chat-input-row">
          {rows === 1 ? (
            <input
              className="agent-chat-input"
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void handleTextSend()}
              placeholder="Digite aqui…"
            />
          ) : (
            <textarea
              className="agent-chat-input"
              rows={rows}
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Digite aqui…"
            />
          )}
          <button type="button" className="agent-chat-send" onClick={() => void handleTextSend()}>
            Enviar
          </button>
          {optional ? (
            <button type="button" className="agent-chat-skip" onClick={() => void commitAndAdvance({ [s.id]: '' })}>
              Pular
            </button>
          ) : null}
        </div>
      );
    }

    if (s.type === 'chips-single') {
      const opts =
        s.id === 'tone'
          ? TONE_OPTS
          : s.id === 'uniform'
            ? UNIFORM_OPTS
            : s.id === 'uniformLoan'
              ? UNIFORM_LOAN_OPTS
              : s.id === 'trial'
                ? TRIAL_OPTS
                : s.id === 'priceFlow'
                  ? PRICE_FLOW_OPTS
                  : s.id === 'scheduling'
                    ? SCHEDULING_OPTS
                    : [];
      return (
        <div className="agent-chat-chips">
          {opts.map((o) => (
            <button key={o} type="button" className="agent-chat-chip" onClick={() => void handleChipSingle(o)}>
              {o}
            </button>
          ))}
        </div>
      );
    }

    if (s.type === 'chips-multi' || s.type === 'chips-multi-conditional') {
      const opts =
        s.id === 'segment' ? SEGMENT_OPTS : s.id === 'plans' ? PLAN_OPTS : s.id === 'amenities' ? AMENITY_OPTS : s.id === 'trialDetails' ? TRIAL_DETAIL_OPTS : [];
      return (
        <>
          <div className="agent-chat-chips">
            {opts.map((o) => (
              <button
                key={o}
                type="button"
                className={`agent-chat-chip${multiSel.includes(o) ? ' selected' : ''}`}
                onClick={() => toggleMulti(o)}
              >
                {o}
              </button>
            ))}
          </div>
          <button type="button" className="agent-chat-send" style={{ alignSelf: 'flex-start' }} onClick={() => void handleMultiConfirm()}>
            Confirmar seleção
          </button>
        </>
      );
    }

    if (s.id === 'planPrices') {
      const keys = answers.plans || [];
      if (keys.length === 0) {
        return <p className="text-small" style={{ color: 'var(--text-muted)' }}>Nenhum plano selecionado.</p>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {keys.map((k) => (
            <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
              <span>{k}</span>
              <input
                className="agent-chat-input"
                value={priceDraft[k] || ''}
                onChange={(e) => setPriceDraft((d) => ({ ...d, [k]: e.target.value }))}
                placeholder="Ex.: R$ 189/mês"
              />
            </label>
          ))}
          <button type="button" className="agent-chat-send" style={{ alignSelf: 'flex-start' }} onClick={() => void handlePricesSend()}>
            Enviar preços
          </button>
        </div>
      );
    }

    if (s.id === 'enrollment') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="agent-chat-chips">
            <button type="button" className={`agent-chat-chip${enrollYes === true ? ' selected' : ''}`} onClick={() => setEnrollYes(true)}>
              Sim
            </button>
            <button type="button" className={`agent-chat-chip${enrollYes === false ? ' selected' : ''}`} onClick={() => setEnrollYes(false)}>
              Não
            </button>
          </div>
          {enrollYes === true ? (
            <input
              className="agent-chat-input"
              value={enrollVal}
              onChange={(e) => setEnrollVal(e.target.value)}
              placeholder="Valor da matrícula"
            />
          ) : null}
          <button type="button" className="agent-chat-send" style={{ alignSelf: 'flex-start' }} onClick={() => void handleEnrollmentSend()}>
            Confirmar
          </button>
        </div>
      );
    }

    if (s.id === 'discount') {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="agent-chat-chips">
            <button type="button" className={`agent-chat-chip${discYes === true ? ' selected' : ''}`} onClick={() => setDiscYes(true)}>
              Sim
            </button>
            <button type="button" className={`agent-chat-chip${discYes === false ? ' selected' : ''}`} onClick={() => setDiscYes(false)}>
              Não
            </button>
          </div>
          {discYes === true ? (
            <textarea
              className="agent-chat-input"
              rows={2}
              value={discText}
              onChange={(e) => setDiscText(e.target.value)}
              placeholder="Descreva descontos ou promoções"
            />
          ) : null}
          <button type="button" className="agent-chat-send" style={{ alignSelf: 'flex-start' }} onClick={() => void handleDiscountSend()}>
            Confirmar
          </button>
        </div>
      );
    }

    return null;
  }

  return (
    <div className="agent-chat-container">
      <div className="agent-chat-header">
        <div className="agent-chat-header-brand">
          <img src="/navi-icon.png" alt="Nave" className="agent-chat-logo" />
          <div>
            <div className="agent-chat-title">Configuração do assistente</div>
            <div className="agent-chat-subtitle">
              Nave · Passo {started && !done && !generating ? stepIndex + 1 : done ? STEPS.length : '—'} de {STEPS.length}
            </div>
          </div>
        </div>
        <div className="agent-chat-progress">
          <div className="agent-chat-progress-bar" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div ref={messagesScrollRef} className="agent-chat-messages" style={{ overscrollBehavior: 'contain' }}>
        {loading ? (
          <div className="agent-chat-bubble nave">
            <img src="/navi-icon.png" className="agent-chat-avatar" alt="" />
            <div className="agent-chat-content">
              <div className="agent-chat-text">Carregando…</div>
            </div>
          </div>
        ) : null}
        {messages.map((msg, i) => (
          <div key={i} className={`agent-chat-bubble ${msg.role}`}>
            {msg.role === 'nave' && <img src="/navi-icon.png" className="agent-chat-avatar" alt="" />}
            <div className="agent-chat-content">
              <div className="agent-chat-text">{msg.content}</div>
              {msg.actions && (
                <div className="agent-chat-actions">
                  {msg.actions.map((a, j) => (
                    <button key={j} type="button" onClick={a.action} className="agent-chat-chip">
                      {a.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {generating ? (
          <div className="agent-chat-bubble nave">
            <img src="/navi-icon.png" className="agent-chat-avatar" alt="" />
            <div className="agent-chat-typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
        <div ref={messagesEndRef} />
      </div>

      <div className="agent-chat-input-area">{renderCurrentInput()}</div>
    </div>
  );
}
