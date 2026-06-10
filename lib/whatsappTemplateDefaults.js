/**
 * Defaults e labels dos templates WhatsApp por academia (campo whatsappTemplates).
 * Usado no cliente (Vite) e em rotas API (Vercel).
 */

export const WHATSAPP_TEMPLATE_CHAR_LIMIT = 1024;

/** Limite após interpolação de placeholders (envio Zapster / wa.me). */
export const WHATSAPP_OUTBOUND_CHAR_LIMIT = 4096;

export const SYSTEM_WHATSAPP_TEMPLATE_COUNT = 7;

export const WHATSAPP_TEMPLATE_KEYS = [
  'confirm',
  'reminder',
  'post_class',
  'missed',
  'recovery',
  'dashboard_contact',
  'birthday',
];

export const DEFAULT_WHATSAPP_TEMPLATES = {
  confirm:
    'Olá {primeiroNome}! Confirmando sua aula experimental {dataAula}{horaAula}. Venha com roupa confortável! Qualquer dúvida, estamos à disposição.',
  reminder:
    'Oi {primeiroNome}! Passando para lembrar da sua aula experimental {amanhaData}{horaAula}. Estamos te esperando!',
  post_class:
    '{primeiroNome}, foi um prazer ter você na nossa academia! O que achou da aula? Quer que eu te envie os valores e horários para começar?',
  missed:
    'Oi {primeiroNome}! Sentimos sua falta na aula experimental. Sei que imprevistos acontecem! Quer remarcar para outro dia? Estamos com horários disponíveis essa semana.',
  recovery:
    'Olá {primeiroNome}! Tudo bem? Vi que você visitou nossa academia recentemente. Ainda tem interesse em começar no Jiu-Jitsu? Temos turmas nos horários da manhã e noite. Vou adorar ajudar!',
  dashboard_contact:
    'Olá {primeiroNome}! O que achou da aula experimental{dataAulaOpcional}? Quer que eu te envie os valores e horários para começar?',
  birthday:
    'Feliz aniversário, {primeiroNome}!\n\nA equipe da {nomeAcademia} deseja um dia muito especial. Que este ano seja incrível dentro e fora do tatame!',
};

export const WHATSAPP_TEMPLATE_LABELS = {
  confirm: 'Confirmar Aula',
  reminder: 'Lembrete',
  post_class: 'Pós-Aula',
  missed: 'Não Compareceu',
  recovery: 'Recuperação',
  dashboard_contact: 'Contato (Dashboard)',
  birthday: 'Aniversário (automático)',
};

/** Fallback do cron de aniversário se não houver template em whatsappTemplates.birthday nem birthdayMessage na academia. */
export const BIRTHDAY_CRON_DEFAULT_TEXT =
  'Feliz aniversário, {primeiroNome}! A equipe da {nomeAcademia} deseja um dia incrível!';

const KNOWN_PLACEHOLDER_KEYS = new Set([
  'primeiroNome',
  'nome',
  'dataAula',
  'horaAula',
  'amanhaData',
  'nomeAcademia',
  'dataAulaOpcional',
]);

/** Variáveis conhecidas com rótulo amigável e exemplo renderizado. */
export const WHATSAPP_TEMPLATE_PLACEHOLDERS = [
  { key: '{primeiroNome}', token: 'primeiroNome', label: 'Primeiro nome', example: 'João' },
  { key: '{nome}', token: 'nome', label: 'Primeiro nome (legado)', example: 'João' },
  { key: '{dataAula}', token: 'dataAula', label: 'Data da aula', example: '15/05/2026' },
  { key: '{horaAula}', token: 'horaAula', label: 'Hora da aula', example: ' às 19:00' },
  { key: '{amanhaData}', token: 'amanhaData', label: 'Texto “amanhã (data)”', example: 'amanhã (15/05/2026)' },
  { key: '{nomeAcademia}', token: 'nomeAcademia', label: 'Nome da academia', example: 'Academia Exemplo' },
  { key: '{dataAulaOpcional}', token: 'dataAulaOpcional', label: 'Data opcional', example: ' do dia 15/05/2026' },
];

const PLACEHOLDER_RE = /\{([a-zA-Z0-9_]+)\}/g;

/**
 * @param {string} text
 * @returns {{ ok: boolean; unknown: string[] }}
 */
export function validateTemplatePlaceholders(text) {
  const unknown = new Set();
  const s = String(text || '');
  let m;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  while ((m = re.exec(s)) !== null) {
    const token = String(m[1] || '').trim();
    if (token && !KNOWN_PLACEHOLDER_KEYS.has(token)) unknown.add(`{${token}}`);
  }
  const list = [...unknown];
  return { ok: list.length === 0, unknown: list };
}

/**
 * Normaliza quebras de linha, remove caracteres de controle e limita tamanho pós-interpolação.
 * @param {string} text
 * @param {number} [maxLen]
 */
export function sanitizeOutboundText(text, maxLen = WHATSAPP_OUTBOUND_CHAR_LIMIT) {
  let out = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const cap = Math.max(1, Number(maxLen) || WHATSAPP_OUTBOUND_CHAR_LIMIT);
  if (out.length > cap) out = out.slice(0, cap);
  return out;
}

/**
 * @param {unknown} raw
 * @returns {{ templates: Record<string, string>; archive: Record<string, { body?: string; archivedAt?: string; archivedBy?: string }> }}
 */
export function parseWhatsappTemplatesField(raw) {
  const archive = {};
  const templates = { ...DEFAULT_WHATSAPP_TEMPLATES };
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { templates, archive };
    }
    const meta = parsed._meta && typeof parsed._meta === 'object' ? parsed._meta : null;
    if (meta?.archive && typeof meta.archive === 'object') {
      for (const [k, v] of Object.entries(meta.archive)) {
        if (v && typeof v === 'object') archive[k] = { ...v };
      }
    }
    for (const key of WHATSAPP_TEMPLATE_KEYS) {
      if (typeof parsed[key] === 'string') templates[key] = String(parsed[key]);
    }
    return { templates, archive };
  } catch {
    return { templates, archive };
  }
}

/**
 * @param {Record<string, string>} templates
 * @param {Record<string, object>} [archive]
 */
export function serializeWhatsappTemplatesField(templates, archive = {}) {
  const out = {};
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    if (typeof templates[key] === 'string') out[key] = String(templates[key]);
  }
  const arch = {};
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    if (archive[key] && typeof archive[key] === 'object') arch[key] = archive[key];
  }
  if (Object.keys(arch).length > 0) {
    out._meta = { archive: arch };
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ lead?: Record<string, unknown>; academyName?: string }} ctx
 */
export function applyWhatsappTemplatePlaceholders(text, { lead, academyName }) {
  const nomeAcademia = String(academyName || '').trim() || 'nossa academia';
  const nome = String(lead?.name || lead?.lead_name || '')
    .trim()
    .split(/\s+/)[0] || '';
  const sched = lead?.scheduledDate || lead?.scheduled_date || '';
  let dstr = '';
  if (sched) {
    try {
      dstr = new Date(`${sched}T00:00:00`).toLocaleDateString('pt-BR');
    } catch {
      dstr = '';
    }
  }
  const tstr = String(lead?.scheduledTime || lead?.scheduled_time || '').trim();
  const dataOpcional = dstr ? ` do dia ${dstr}` : '';
  const amanhaTexto = dstr ? `amanhã (${dstr})` : 'amanhã';
  let out = String(text || '')
    .replaceAll('{primeiroNome}', nome)
    .replaceAll('{nome}', nome)
    .replaceAll('{dataAula}', dstr)
    .replaceAll('{horaAula}', tstr ? ` às ${tstr}` : '')
    .replaceAll('{amanhaData}', amanhaTexto)
    .replaceAll('{nomeAcademia}', nomeAcademia)
    .replaceAll('{dataAulaOpcional}', dataOpcional);
  out = out.replace(/\{[a-zA-Z0-9_]+\}/g, '');
  return sanitizeOutboundText(out);
}

/**
 * @param {unknown} raw — automations_config
 * @returns {Record<string, { automations: { key: string; label: string }[]; birthdayCron: boolean }>}
 */
export function getTemplateUsageByKey(raw) {
  const usage = Object.fromEntries(WHATSAPP_TEMPLATE_KEYS.map((k) => [k, { automations: [], birthdayCron: false }]));
  let cfg = {};
  try {
    const saved = typeof raw === 'string' ? JSON.parse(raw) : raw ?? {};
    cfg = saved && typeof saved === 'object' ? saved : {};
  } catch {
    cfg = {};
  }
  const labels = {
    schedule_confirm: 'Agendamento confirmado',
    presence_confirmed: 'Presença confirmada',
    missed: 'Não compareceu',
    waiting_decision: 'Aguardando decisão',
    followup_d1_attended: 'Retorno D+1 (compareceu)',
    converted: 'Matrícula realizada',
    schedule_reminder: 'Lembrete de aula',
  };
  for (const [autoKey, row] of Object.entries(cfg)) {
    if (!row || typeof row !== 'object' || row.active !== true) continue;
    const tk = String(row.templateKey || '').trim();
    if (!tk || !usage[tk]) continue;
    usage[tk].automations.push({ key: autoKey, label: labels[autoKey] || autoKey });
  }
  if (usage.birthday) usage.birthday.birthdayCron = true;
  return usage;
}

export function isTemplateInUse(usageEntry) {
  if (!usageEntry) return false;
  return (usageEntry.automations?.length > 0) || usageEntry.birthdayCron === true;
}

/**
 * @param {unknown} raw
 * @returns {{ q: string; a: string }[]}
 */
export function parseFaqItems(raw) {
  if (raw == null || raw === '') return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(p)) return [];
    return p
      .filter((x) => x && typeof x === 'object')
      .map((x) => ({
        q: String(x.q || '').trim(),
        a: String(x.a || '').trim(),
      }))
      .filter((x) => x.q && x.a)
      .slice(0, 80);
  } catch {
    return [];
  }
}
