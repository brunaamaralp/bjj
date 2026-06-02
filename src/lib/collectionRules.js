/**
 * Régua de cobrança configurável por academia (mensalidades inadimplentes).
 *
 * Cron `collection-overdue` (lib/server/runCollectionOverdueCron.js):
 * - Não cria tarefa se payment.status === 'awaiting' (aguardando confirmação).
 * - Não cria tarefa se o aluno estiver em snooze de régua no mês de referência
 *   (collection_snooze_month === YYYY-MM no documento do aluno).
 * - Não envia WhatsApp automaticamente; persiste overdue no aluno + tarefa para a equipe.
 */

export const DEFAULT_OVERDUE_LABEL = 'Inadimplente';

export const COLLECTION_RESULT_OPTIONS = [
  { value: 'no_response', label: 'Sem resposta' },
  { value: 'promised_pay', label: 'Prometeu pagar' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'other', label: 'Outro' },
];

export const DEFAULT_COLLECTION_RULES = [
  {
    day: 1,
    label: '1ª tentativa',
    defaultMessage:
      'Oi [nome], passando para lembrar que a mensalidade venceu. Quando puder, nos avise para regularizar. Obrigado!',
    escalate: false,
  },
  {
    day: 7,
    label: '2ª tentativa',
    defaultMessage:
      'Olá [nome], sua mensalidade segue em aberto. Pode nos responder com uma previsão de pagamento?',
    escalate: false,
  },
  {
    day: 15,
    label: '3ª tentativa',
    defaultMessage:
      'Oi [nome], ainda consta pendência da mensalidade. Se passar na academia, conversamos pessoalmente também.',
    escalate: false,
  },
  {
    day: 30,
    label: 'Escalar para responsável',
    defaultMessage: '',
    escalate: true,
  },
];

const COLLECTION_MARKER = '[collection_rule]';

function normalizeRule(raw, index) {
  const day = Math.max(1, Math.min(365, Math.trunc(Number(raw?.day) || 0)));
  const label = String(raw?.label || '').trim() || `Etapa ${index + 1}`;
  const defaultMessage =
    raw?.defaultMessage === null || raw?.defaultMessage === undefined
      ? ''
      : String(raw?.defaultMessage ?? '');
  return {
    day,
    label,
    defaultMessage,
    escalate: raw?.escalate === true,
  };
}

export function parseCollectionRules(raw) {
  if (!raw) return DEFAULT_COLLECTION_RULES.map((r) => ({ ...r }));
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return DEFAULT_COLLECTION_RULES.map((r) => ({ ...r }));
    }
    const rules = parsed.map((r, i) => normalizeRule(r, i)).filter((r) => r.day >= 1);
    rules.sort((a, b) => a.day - b.day);
    return rules.length ? rules : DEFAULT_COLLECTION_RULES.map((r) => ({ ...r }));
  } catch {
    return DEFAULT_COLLECTION_RULES.map((r) => ({ ...r }));
  }
}

export function serializeCollectionRules(rules) {
  const list = parseCollectionRules(rules);
  return JSON.stringify(list);
}

export function parseOverdueLabel(raw) {
  const s = String(raw || '').trim();
  return s || DEFAULT_OVERDUE_LABEL;
}

function parseFinanceConfigRaw(raw) {
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

/** Lê régua de cobrança do objeto financeConfig (preferencial). */
export function readCollectionSettingsFromFinanceConfig(financeConfig) {
  const cfg = financeConfig && typeof financeConfig === 'object' ? financeConfig : null;
  return {
    collectionRules: parseCollectionRules(cfg?.collectionRules ?? cfg?.collection_rules),
    overdueLabel: parseOverdueLabel(cfg?.overdueLabel ?? cfg?.overdue_label),
  };
}

/**
 * @param {object} academyDoc — documento da academia
 * Lê de financeConfig; atributos soltos collection_rules/overdue_label só como legado.
 */
export function readCollectionSettingsFromAcademy(academyDoc) {
  const fromFinance = readCollectionSettingsFromFinanceConfig(parseFinanceConfigRaw(academyDoc?.financeConfig));
  const legacyRules = academyDoc?.collection_rules ?? academyDoc?.collectionRules;
  const legacyLabel = academyDoc?.overdue_label ?? academyDoc?.overdueLabel;
  return {
    collectionRules: legacyRules ? parseCollectionRules(legacyRules) : fromFinance.collectionRules,
    overdueLabel: legacyLabel ? parseOverdueLabel(legacyLabel) : fromFinance.overdueLabel,
  };
}

/** Mescla régua no payload que será salvo em financeConfig. */
export function mergeCollectionIntoFinanceConfig(financeConfig, { collectionRules, overdueLabel }) {
  const base = financeConfig && typeof financeConfig === 'object' ? { ...financeConfig } : {};
  return {
    ...base,
    collectionRules: parseCollectionRules(collectionRules),
    overdueLabel: parseOverdueLabel(overdueLabel).slice(0, 30),
  };
}

export function applyNamePlaceholder(message, studentName) {
  const name = String(studentName || '').trim() || 'aluno(a)';
  return String(message || '').replace(/\[nome\]/gi, name);
}

export function buildCollectionTaskTitle(rule, studentName) {
  const label = String(rule?.label || 'Cobrança').trim();
  const name = String(studentName || '').trim() || 'Aluno';
  if (/cobrança/i.test(label)) return `${label} — ${name}`;
  return `${label} de cobrança — ${name}`;
}

export function buildCollectionTaskDescription(rule, studentName) {
  const day = Math.trunc(Number(rule?.day) || 0);
  const stage = String(rule?.label || '').trim();
  const body = applyNamePlaceholder(rule?.defaultMessage, studentName);
  return `${COLLECTION_MARKER}\nday: ${day}\nstage: ${stage}\n---\n${body}`.trim();
}

export function parseCollectionTaskDescription(description) {
  const text = String(description || '');
  if (!text.includes(COLLECTION_MARKER)) return null;
  const dayMatch = text.match(/^day:\s*(\d+)/m);
  const stageMatch = text.match(/^stage:\s*(.+)$/m);
  const parts = text.split(/\n---\n/);
  const message = parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : '';
  return {
    day: dayMatch ? Math.trunc(Number(dayMatch[1])) : null,
    stage: stageMatch ? String(stageMatch[1]).trim() : '',
    message,
  };
}

export function isCollectionTask(task) {
  return String(task?.description || '').includes(COLLECTION_MARKER);
}

/** Etapa atual = maior regra cujo day <= daysOverdue */
export function resolveCollectionStage(daysOverdue, rules) {
  const days = Math.max(0, Math.trunc(Number(daysOverdue) || 0));
  const list = parseCollectionRules(rules);
  let current = null;
  for (const rule of list) {
    if (days >= rule.day) current = rule;
  }
  return current;
}

/** Distribuição por etapa: bucket key = rule.day */
export function bucketOverdueByStage(daysOverdue, rules) {
  const stage = resolveCollectionStage(daysOverdue, rules);
  if (!stage) return null;
  return stage.day;
}

export function formatCollectionResultLabel(result) {
  const opt = COLLECTION_RESULT_OPTIONS.find((o) => o.value === result);
  return opt?.label || String(result || '—');
}

export function formatCollectionAttemptText({ stage, result, notes }) {
  const res = formatCollectionResultLabel(result);
  const st = String(stage || '').trim();
  let t = st ? `Cobrança (${st}): ${res}` : `Tentativa de cobrança: ${res}`;
  const n = String(notes || '').trim();
  if (n) t += ` — ${n}`;
  return t.slice(0, 1000);
}

/** Texto de tooltip para chips D+N na listagem de mensalidades. */
export function buildReguaStageTooltip(rule) {
  const day = Math.trunc(Number(rule?.day) || 0);
  const label = String(rule?.label || `D+${day}`).trim();
  if (rule?.escalate) {
    return `D+${day} (${label}): cria tarefa para o responsável da academia e registra na timeline. Não envia WhatsApp automaticamente.`;
  }
  const msg = String(rule?.defaultMessage || '').trim();
  const msgHint = msg
    ? ` com esta mensagem sugerida: «${msg.slice(0, 120)}${msg.length > 120 ? '…' : ''}»`
    : '';
  return `${day} dia(s) após o vencimento → cria tarefa para a equipe${msgHint}. Aplica a etiqueta de inadimplência se ainda não estiver. Não envia WhatsApp automaticamente.`;
}

export function isCollectionSnoozed(studentOrDoc, referenceMonth) {
  const ym = String(referenceMonth || '').trim().slice(0, 7);
  if (!ym) return false;
  const snoozeMonth = String(
    studentOrDoc?.collection_snooze_month ?? studentOrDoc?.collectionSnoozeMonth ?? ''
  ).trim();
  if (snoozeMonth !== ym) return false;
  const until = String(
    studentOrDoc?.collection_snooze_until ?? studentOrDoc?.collectionSnoozeUntil ?? ''
  ).trim();
  if (!until) return true;
  const t = new Date(until).getTime();
  return Number.isFinite(t) ? Date.now() <= t : true;
}

export function academyHasFinanceModule(academyDoc) {
  try {
    const raw = academyDoc?.modules;
    const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return m?.finance === true;
  } catch {
    return false;
  }
}
