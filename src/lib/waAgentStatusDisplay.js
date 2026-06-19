import { HelpCircle, Power, QrCode, RefreshCw, Unplug } from 'lucide-react';

/** Rótulo curto para o status da conexão WhatsApp na UI. */
export function formatWaAgentStatus(status) {
  const k = String(status || '').trim().toLowerCase();
  if (!k) return 'Aguardando conexão';
  if (k === 'connected' || k === 'online') return 'Conectado';
  if (k === 'offline') return 'Conexão pausada';
  if (k === 'open' || k === 'scanning' || k === 'qrcode') return 'Aguardando leitura do QR';
  if (k === 'connecting' || k === 'syncing') return 'Reconectando…';
  if (k === 'disconnected') return 'Desvinculado do WhatsApp';
  if (k === 'unknown') return 'Em verificação';
  if (k === 'error' || k === 'failed') return 'Erro na conexão';
  const words = k.replace(/_/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'Aguardando conexão';
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/** Ícone + cores para a faixa de status (conexão não ativa). */
export function waAgentStatusVisual(status) {
  const k = String(status || '').trim().toLowerCase();
  if (k === 'offline') return { Icon: Power, accent: '#c2410c', bg: 'rgba(194, 65, 12, 0.08)' };
  if (k === 'open' || k === 'scanning' || k === 'qrcode') {
    return { Icon: QrCode, accent: '#25D366', bg: 'rgba(37, 211, 102, 0.08)' };
  }
  if (k === 'connecting' || k === 'syncing') {
    return { Icon: RefreshCw, accent: 'var(--color-primary)', bg: 'rgba(108, 71, 216, 0.08)' };
  }
  if (k === 'disconnected') return { Icon: Unplug, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
  return { Icon: HelpCircle, accent: 'var(--text-secondary)', bg: 'var(--surface)' };
}

export function formatWaLastChecked(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
