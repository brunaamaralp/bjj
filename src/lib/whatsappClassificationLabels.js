import { TERMS } from './terminology.js';

const INTENTION_LABELS_FITNESS = {
  horarios_adulto: 'Perguntou horários (adulto)',
  horarios_crianca: 'Perguntou horários (criança)',
  horarios_junior: 'Perguntou horários (juniores)',
  preco_adulto: 'Perguntou preço',
  preco_crianca: 'Perguntou preço (criança)',
  preco_uniforme_adulto: 'Perguntou preço de equipamento',
  preco_uniforme_infantil: 'Perguntou preço de equipamento infantil',
  aula_experimental: 'Quer agendar experimental',
  duvida: 'Dúvida geral',
  aluno_atual: 'Já é aluno',
  aviso_sem_pergunta: 'Aviso sem pergunta',
  outro: 'Outro assunto',
};

const INTENTION_LABELS_PHYSIO = {
  ...INTENTION_LABELS_FITNESS,
  aula_experimental: 'Quer agendar avaliação',
  aluno_atual: 'Já é paciente',
  preco_adulto: 'Perguntou valores',
  preco_crianca: 'Perguntou valores (criança)',
};

const PRIORITY_LABELS = {
  alta: 'Urgente',
  media: 'Prioridade média',
  baixa: 'Prioridade baixa',
};

function resolveTerms(termsOrVertical) {
  if (termsOrVertical && typeof termsOrVertical === 'object' && termsOrVertical.trial) {
    return termsOrVertical;
  }
  const vertical = String(termsOrVertical || 'fitness').trim() === 'physio' ? 'physio' : 'fitness';
  return TERMS[vertical];
}

function intentionMapForTerms(terms) {
  const isPhysio = terms.trialShort === 'Avaliação' || terms.student === 'Paciente';
  return isPhysio ? INTENTION_LABELS_PHYSIO : INTENTION_LABELS_FITNESS;
}

/**
 * @param {string|null|undefined} intention
 * @param {{ terms?: object, vertical?: string }} [opts]
 */
export function intentionDisplayLabel(intention, opts = {}) {
  const raw = String(intention || '').trim();
  if (!raw) return '';
  const terms = resolveTerms(opts.terms || opts.vertical);
  const map = intentionMapForTerms(terms);
  if (map[raw]) return map[raw];
  return raw.replace(/_/g, ' ');
}

/**
 * @param {string|null|undefined} priority
 */
export function priorityDisplayLabel(priority) {
  const raw = String(priority || '').trim().toLowerCase();
  if (!raw) return '';
  return PRIORITY_LABELS[raw] || raw;
}

/**
 * @param {boolean|null|undefined} hotLead
 */
export function hotLeadDisplayLabel(hotLead) {
  return hotLead ? 'Interessado' : '';
}

/**
 * @param {boolean|null|undefined} needHuman
 */
export function needHumanDisplayLabel(needHuman) {
  return needHuman ? 'Precisa resposta' : '';
}
