import { humanHandoffUntilToMs } from './humanHandoffUntil.js';

const NEAR_MS = 60 * 60 * 1000;

/** Ex.: ms → `"14h30"` (pt-BR, 24h). */
export function formatRetomaTimeCompactPtBr(ms) {
  const d = new Date(Number(ms));
  if (!Number.isFinite(d.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
    if (!hour) return '';
    return `${hour}h${minute}`;
  } catch {
    return '';
  }
}

/**
 * Camada de apresentação do handoff (texto + cores). Não altera regras de negócio.
 * @param {{ needHuman: boolean, humanHandoffUntil: string | null | undefined, nowMs: number }} p
 */
export function getHandoffPresentation({ needHuman, humanHandoffUntil, nowMs }) {
  const t = Number(nowMs);
  const now = Number.isFinite(t) ? t : Date.now();
  const untilMs = humanHandoffUntilToMs(humanHandoffUntil);
  const remaining = untilMs > 0 ? untilMs - now : null;
  const expired = untilMs > 0 && untilMs <= now;

  if (!needHuman) {
    return {
      variant: 'ia',
      dotColor: 'var(--inbox-info-badge-fg)',
      bg: 'var(--inbox-info-badge-bg)',
      fg: 'var(--inbox-info-badge-fg)',
      text: 'A IA está respondendo — você pode entrar se quiser'
    };
  }

  if (expired) {
    return {
      variant: 'expired',
      dotColor: 'var(--inbox-info-badge-fg)',
      bg: 'var(--inbox-info-badge-bg)',
      fg: 'var(--inbox-info-badge-fg)',
      text: 'O período em modo manual terminou — a IA pode voltar a responder.'
    };
  }

  if (remaining != null && remaining > 0 && remaining <= NEAR_MS) {
    const timeCompact = formatRetomaTimeCompactPtBr(untilMs);
    const text = timeCompact
      ? `A IA retoma automaticamente às ${timeCompact}`
      : 'A IA retoma em breve';
    return {
      variant: 'soon',
      dotColor: 'var(--success-dot)',
      bg: 'var(--success-light)',
      fg: 'var(--success-text)',
      text
    };
  }

  return {
    variant: 'human',
    dotColor: 'var(--warning)',
    bg: 'var(--warning-light)',
    fg: 'var(--warning-text)',
    text: 'É com você agora — responda por aqui'
  };
}

/**
 * Pills do cabeçalho do thread: "Você no controle" (coral) | "IA respondendo" (violeta).
 */
export function getThreadHandoffPill({ needHuman, humanHandoffUntil, nowMs }) {
  const pres = getHandoffPresentation({ needHuman, humanHandoffUntil, nowMs });
  if (pres.variant === 'human' || pres.variant === 'soon') {
    return {
      label: 'Você no controle',
      bg: 'var(--inbox-handoff-banner-bg)',
      color: 'var(--inbox-handoff-banner-text)',
      border: '1px solid var(--inbox-attention-border)',
    };
  }
  return {
    label: 'IA respondendo',
    bg: 'var(--inbox-handoff-banner-ia-bg)',
    color: 'var(--inbox-handoff-banner-ia-text)',
    border: '1px solid var(--inbox-handoff-banner-ia-border)',
  };
}

/**
 * Faixa única no cabeçalho do thread: IA ativa | humano | IA retomando em breve.
 */
export function getThreadHandoffBanner({ needHuman, humanHandoffUntil, nowMs }) {
  const pres = getHandoffPresentation({ needHuman, humanHandoffUntil, nowMs });
  if (pres.variant === 'ia' || pres.variant === 'expired') {
    return {
      variant: 'ia',
      bg: 'var(--inbox-info-badge-bg)',
      color: 'var(--inbox-info-badge-fg)',
      text: 'A IA está respondendo — você pode entrar se quiser'
    };
  }
  if (pres.variant === 'soon') {
    return {
      variant: 'soon',
      bg: 'var(--success-light)',
      color: 'var(--success-text)',
      text: pres.text
    };
  }
  return {
    variant: 'human',
    bg: 'var(--warning-light)',
    color: 'var(--warning-text)',
    text: 'É com você agora — responda por aqui'
  };
}
