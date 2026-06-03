import { formatInboxDayLabel, inboxMessageKey, senderKindFromInboxMessage } from './inboxMessageUtils.js';

/**
 * Agrupa mensagens em divisores de dia + grupos de bolhas (mesmo remetente em janela de 2 min).
 * @param {unknown[]} messages
 */
export function buildInboxThreadBlocks(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const out = [];
  let lastDayKey = '';
  let group = null;
  let lastTs = 0;

  for (const m of msgs) {
    const ts = String(m?.timestamp || '').trim();
    const d = ts ? new Date(ts) : null;
    const ms = d && Number.isFinite(d.getTime()) ? d.getTime() : 0;
    const dayKey = d && Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '';
    if (dayKey && dayKey !== lastDayKey) {
      out.push({
        type: 'day',
        key: dayKey,
        label: formatInboxDayLabel(ts) || d.toLocaleDateString('pt-BR'),
      });
      lastDayKey = dayKey;
      group = null;
      lastTs = 0;
    }

    const role = m?.role === 'assistant' ? 'assistant' : 'user';
    const senderKind = senderKindFromInboxMessage(m);
    const bubbleKind = role === 'assistant' ? (senderKind === 'human' ? 'human' : 'ai') : 'user';
    const alignEnd = bubbleKind !== 'user';
    const key = inboxMessageKey(m);
    const gapOk = ms && lastTs ? ms - lastTs <= 2 * 60 * 1000 : false;
    const canAppend = group && group.bubbleKind === bubbleKind && gapOk;
    if (!canAppend) {
      group = {
        type: 'group',
        id: `${out.length}-${bubbleKind}`,
        bubbleKind,
        alignEnd,
        senderKind,
        items: [],
      };
      out.push(group);
    }
    group.items.push({ key, m });
    if (ms) lastTs = ms;
  }

  return out;
}
