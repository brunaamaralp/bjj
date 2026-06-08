const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse YYYY-MM-DD (ou prefixo ISO) para Date local; null se inválido. */
export function parseLeadYmd(raw) {
  const s = String(raw || '').trim().split('T')[0];
  if (!YMD_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Rótulo amigável para data/hora agendada (experimental etc.).
 * @returns {{ text: string, variant: 'today'|'soon'|'past'|'default' } | null}
 */
export function formatLeadScheduledLine(lead) {
  const ymd = String(lead?.scheduledDate || '').trim();
  if (!ymd) return null;
  const date = parseLeadYmd(ymd);
  if (!date) return null;

  const time = String(lead?.scheduledTime || '').trim();
  const timeSuffix = time ? ` às ${time}` : '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return { text: `Hoje${timeSuffix}`, variant: 'today' };
  if (diffDays === 1) return { text: `Amanhã${timeSuffix}`, variant: 'soon' };
  if (diffDays === -1) return { text: `Ontem${timeSuffix}`, variant: 'past' };

  const formatted = date.toLocaleDateString('pt-BR');
  const variant = diffDays > 0 && diffDays <= 7 ? 'soon' : diffDays < 0 ? 'past' : 'default';
  return { text: `${formatted}${timeSuffix}`, variant };
}

/** Timestamp ISO da última interação conhecida (WhatsApp). */
export function resolveLeadLastInteractionAt(lead) {
  const wa = String(lead?.lastWhatsappActivityAt || '').trim();
  if (!wa) return null;
  const d = new Date(wa);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Tempo relativo curto em pt-BR: "há 2d", "ontem", "há 3h". */
export function formatRelativeTimeAgo(dateInput) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(d.getTime())) return '';

  const diffMs = Date.now() - d.getTime();
  if (diffMs < 0) return '';

  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;

  const hours = Math.floor(diffMs / 3600000);
  if (hours < 24) return `há ${hours}h`;

  const days = Math.floor(diffMs / 86400000);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days}d`;
  if (days < 30) return `há ${Math.floor(days / 7)} sem`;

  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

/** Linha de meta para card do funil; null se sem dados. */
export function formatLeadLastInteractionLine(lead) {
  const at = resolveLeadLastInteractionAt(lead);
  if (!at) return null;
  const ago = formatRelativeTimeAgo(at);
  if (!ago) return null;
  return `Última msg ${ago}`;
}

/** Pluralização simples para contagem de leads/contatos. */
export function pluralizeContactLabel(count, pluralLabel = 'Leads') {
  const p = String(pluralLabel || 'Leads').trim();
  if (count === 1) {
    if (p.toLowerCase().endsWith('s') && p.length > 1) return p.slice(0, -1).toLowerCase();
    return p.toLowerCase();
  }
  return p.toLowerCase();
}
