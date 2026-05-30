import { describe, expect, it } from 'vitest';
import { buildInboxListRows, estimateInboxListRowHeight } from '../lib/inboxListRows.js';
import { INBOX_LIST_SECTION_INITIAL } from '../lib/inboxUiConstants.js';

function makeItem(id) {
  return { id, phone_number: `5511999${String(id).padStart(4, '0')}` };
}

describe('buildInboxListRows', () => {
  it('retorna header + items para grupo simples', () => {
    const groups = [{ key: 'open', label: 'Em atendimento', items: [makeItem(1), makeItem(2)] }];
    const rows = buildInboxListRows(groups, new Set(), {});
    expect(rows.map((r) => r.type)).toEqual(['header', 'item', 'item']);
    expect(rows[0].count).toBe(2);
  });

  it('colapsa grupo resolvido', () => {
    const groups = [{ key: 'resolved', label: 'Resolvidas', items: [makeItem(1)] }];
    const rows = buildInboxListRows(groups, new Set(['resolved']), {});
    expect(rows.map((r) => r.type)).toEqual(['header', 'collapsed']);
    expect(rows[1].hiddenCount).toBe(1);
  });

  it('limita visíveis e adiciona linha "more"', () => {
    const items = Array.from({ length: INBOX_LIST_SECTION_INITIAL + 5 }, (_, i) => makeItem(i));
    const groups = [{ key: 'open', label: 'Em atendimento', items }];
    const rows = buildInboxListRows(groups, new Set(), {});
    const itemRows = rows.filter((r) => r.type === 'item');
    expect(itemRows.length).toBe(INBOX_LIST_SECTION_INITIAL);
    const more = rows.find((r) => r.type === 'more');
    expect(more?.hiddenCount).toBe(5);
  });

  it('respeita visibleByGroup expandido', () => {
    const items = Array.from({ length: INBOX_LIST_SECTION_INITIAL + 3 }, (_, i) => makeItem(i));
    const groups = [{ key: 'open', label: 'Em atendimento', items }];
    const visibleByGroup = { open: INBOX_LIST_SECTION_INITIAL + 2 };
    const rows = buildInboxListRows(groups, new Set(), visibleByGroup);
    expect(rows.filter((r) => r.type === 'item').length).toBe(INBOX_LIST_SECTION_INITIAL + 2);
    expect(rows.find((r) => r.type === 'more')?.hiddenCount).toBe(1);
  });
});

describe('estimateInboxListRowHeight', () => {
  it('estima alturas por tipo', () => {
    expect(estimateInboxListRowHeight({ type: 'header' })).toBe(28);
    expect(estimateInboxListRowHeight({ type: 'item' })).toBe(54);
    expect(estimateInboxListRowHeight({ type: 'more' })).toBe(36);
  });
});
