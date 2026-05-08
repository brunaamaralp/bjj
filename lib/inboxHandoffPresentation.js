import { humanHandoffUntilToMs } from './humanHandoffUntil.js';

const NEAR_MS = 60 * 60 * 1000;

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
    const d = new Date(untilMs);
    const timeStr = Number.isFinite(d.getTime())
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '';
    const text = timeStr
      ? `A IA retoma automaticamente às ${timeStr}`
      : 'A IA retoma automaticamente em breve';
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
