/**
 * Defaults e labels dos templates WhatsApp por academia (campo whatsappTemplates).
 * Usado no cliente (Vite) e em rotas API (Vercel).
 */

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
    'Feliz aniversário, {primeiroNome}!\n\nA equipe da {nomeAcademia} deseja um dia muito especial. Que este ano seja incrível dentro e fora do tatame!'
};

export const WHATSAPP_TEMPLATE_LABELS = {
  confirm: 'Confirmar Aula',
  reminder: 'Lembrete',
  post_class: 'Pós-Aula',
  missed: 'Não Compareceu',
  recovery: 'Recuperação',
  dashboard_contact: 'Contato (Dashboard)',
  birthday: 'Aniversário (automático)'
};

/** Fallback do cron de aniversário se não houver template em whatsappTemplates.birthday nem birthdayMessage na academia. */
export const BIRTHDAY_CRON_DEFAULT_TEXT =
  'Feliz aniversário, {primeiroNome}! A equipe da {nomeAcademia} deseja um dia incrível!';

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
  return String(text || '')
    .replaceAll('{primeiroNome}', nome)
    .replaceAll('{nome}', nome)
    .replaceAll('{dataAula}', dstr)
    .replaceAll('{horaAula}', tstr ? ` às ${tstr}` : '')
    .replaceAll('{amanhaData}', amanhaTexto)
    .replaceAll('{nomeAcademia}', nomeAcademia)
    .replaceAll('{dataAulaOpcional}', dataOpcional);
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
        a: String(x.a || '').trim()
      }))
      .filter((x) => x.q && x.a)
      .slice(0, 80);
  } catch {
    return [];
  }
}
