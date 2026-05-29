import { describe, expect, it } from 'vitest';

/** Espelha a lógica de groupedFilteredItems em Inbox.jsx (mutuamente exclusiva). */
function groupInboxListItems(items) {
  const unreadN = (it) => {
    const n = Number(it?._unreadCount ?? it?.unread_count ?? 0);
    return Number.isFinite(n) ? n : 0;
  };
  const isResolvedTicket = (it) =>
    String(it?._ticketStatus ?? it?.ticket_status ?? '')
      .trim()
      .toLowerCase() === 'resolved';

  const unread = [];
  const resolved = [];
  const open = [];
  for (const it of items) {
    const u = unreadN(it);
    if (u > 0) unread.push(it);
    else if (isResolvedTicket(it)) resolved.push(it);
    else open.push(it);
  }
  return { unread, resolved, open };
}

describe('groupInboxListItems', () => {
  it('não duplica conversa entre não lidas e resolvidas', () => {
    const phone = '5511999999999';
    const items = [
      {
        phone_number: phone,
        _unreadCount: 2,
        ticket_status: 'resolved',
      },
    ];
    const { unread, resolved, open } = groupInboxListItems(items);
    expect(unread).toHaveLength(1);
    expect(resolved).toHaveLength(0);
    expect(open).toHaveLength(0);
  });

  it('coloca resolvida sem unread só em resolvidas', () => {
    const items = [{ phone_number: '1', _unreadCount: 0, ticket_status: 'resolved' }];
    const { unread, resolved, open } = groupInboxListItems(items);
    expect(unread).toHaveLength(0);
    expect(resolved).toHaveLength(1);
    expect(open).toHaveLength(0);
  });

  it('coloca aberta sem unread em em atendimento', () => {
    const items = [{ phone_number: '1', _unreadCount: 0, ticket_status: 'open' }];
    const { unread, resolved, open } = groupInboxListItems(items);
    expect(unread).toHaveLength(0);
    expect(resolved).toHaveLength(0);
    expect(open).toHaveLength(1);
  });
});
