/** Rótulo de dia para divisores do thread (Hoje, Ontem, …). */
export function formatInboxDayLabel(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dd.getTime() - nn.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Chave estável para mensagem (flags, scroll, seleção). */
export function inboxMessageKey(m) {
  const mid = String(m?.message_id || '').trim();
  if (mid) return mid;
  const role = String(m?.role || '').trim();
  const ts = String(m?.timestamp || '').trim();
  const content = String(m?.content || '').trim();
  return `${role}:${ts}:${content.slice(0, 80)}`;
}

/** Origem da bolha assistant: humano vs IA. */
export function senderKindFromInboxMessage(m) {
  const role = m?.role === 'assistant' ? 'assistant' : 'user';
  if (role !== 'assistant') return 'user';
  const sender = String(m?.sender || '').trim().toLowerCase();
  if (sender === 'human' || sender === 'humano') return 'human';
  if (sender === 'ai' || sender === 'agent' || sender === 'agente') return 'ai';
  const hasAiHints = Boolean(m?.in_reply_to) || (m?.classificacao && typeof m.classificacao === 'object');
  return hasAiHints ? 'ai' : 'human';
}
