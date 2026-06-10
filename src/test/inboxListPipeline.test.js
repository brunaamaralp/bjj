import { describe, it, expect } from 'vitest';
import {
  enrichInboxListItems,
  filterInboxListBySearch,
  filterInboxListItems,
  groupInboxListItems,
} from '../lib/inboxListPipeline.js';

function normPhone(v) {
  return String(v || '').replace(/\D/g, '');
}

describe('inboxListPipeline', () => {
  const items = [
    { _handoffActive: true, _unreadCount: 0, _ticketStatus: 'open' },
    { _handoffActive: false, _unreadCount: 2, _ticketStatus: 'open' },
    { _handoffActive: false, _unreadCount: 0, _ticketStatus: 'resolved' },
  ];

  it('needs_me filter keeps only handoff', () => {
    const out = filterInboxListItems(items, 'needs_me');
    expect(out).toHaveLength(1);
    expect(out[0]._handoffActive).toBe(true);
  });

  it('groups into unread, open, resolved', () => {
    const groups = groupInboxListItems(items);
    expect(groups.find((g) => g.key === 'unread')?.items).toHaveLength(1);
    expect(groups.find((g) => g.key === 'resolved')?.items).toHaveLength(1);
    expect(groups.find((g) => g.key === 'open')?.items).toHaveLength(1);
  });

  it('filterInboxListBySearch matches display title', () => {
    const rows = [
      { _displayTitle: 'Maria Silva', _phone: '5511999999999', _leadName: '', _manualContactName: '', _waProfileName: '' },
      { _displayTitle: 'João', _phone: '5511888888888', _leadName: '', _manualContactName: '', _waProfileName: '' },
    ];
    const out = filterInboxListBySearch(rows, 'maria', normPhone);
    expect(out).toHaveLength(1);
    expect(out[0]._displayTitle).toBe('Maria Silva');
  });

  it('filterInboxListBySearch matches phone digits', () => {
    const rows = [
      { _displayTitle: 'Maria', _phone: '5511999999999', _leadName: '', _manualContactName: '', _waProfileName: '' },
    ];
    const out = filterInboxListBySearch(rows, '99999', normPhone);
    expect(out).toHaveLength(1);
  });

  it('enrichInboxListItems usa lead embutido da API quando maps vazios', () => {
    const out = enrichInboxListItems({
      items: [{ phone_number: '5511999999999', lead: { id: 'l1', name: 'Maria', hotLead: true, status: 'Novo' } }],
      leadById: new Map(),
      leadByPhone: new Map(),
      highlighted: {},
      normalizePhone: normPhone,
      pickDisplayName: ({ leadName, phone }) => leadName || phone,
    });
    expect(out[0]._hotLead).toBe(true);
    expect(out[0]._leadName).toBe('Maria');
  });
});
