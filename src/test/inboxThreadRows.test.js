import { describe, it, expect } from 'vitest';
import {
  estimateInboxThreadBlockHeight,
  findThreadBlockIndexForMsgKey,
  threadBlockReactKey,
} from '../lib/inboxThreadRows.js';

describe('inboxThreadRows', () => {
  it('estimates day divider smaller than message group', () => {
    const day = estimateInboxThreadBlockHeight({ type: 'day', key: '2026-1-1', label: 'Hoje' });
    const group = estimateInboxThreadBlockHeight({
      type: 'group',
      id: 'g1',
      items: [{ key: 'a', m: { type: 'text', content: 'Olá mundo' } }],
    });
    expect(day).toBeLessThan(group);
  });

  it('finds block index by message key', () => {
    const blocks = [
      { type: 'day', key: 'd1' },
      { type: 'group', id: 'g1', items: [{ key: 'msg-1', m: {} }] },
      { type: 'group', id: 'g2', items: [{ key: 'msg-2', m: {} }] },
    ];
    expect(findThreadBlockIndexForMsgKey(blocks, 'msg-2')).toBe(2);
    expect(findThreadBlockIndexForMsgKey(blocks, 'missing')).toBe(-1);
  });

  it('builds stable react keys', () => {
    expect(threadBlockReactKey({ type: 'day', key: '2026-3-1' }, 0)).toBe('day:2026-3-1');
    expect(threadBlockReactKey({ type: 'group', id: 'abc' }, 1)).toBe('group:abc');
  });
});
