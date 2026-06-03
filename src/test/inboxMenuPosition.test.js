import { describe, it, expect } from 'vitest';
import { computeInboxMenuPosition } from '../lib/inboxMenuPosition.js';

describe('computeInboxMenuPosition', () => {
  it('places message menu to the left of anchor right edge', () => {
    const anchor = {
      getBoundingClientRect: () => ({
        left: 100,
        top: 200,
        right: 200,
        bottom: 240,
        width: 100,
        height: 40,
      }),
    };
    const { x, y } = computeInboxMenuPosition({
      kind: 'message',
      anchorEl: anchor,
      menuW: 260,
      menuH: 300,
      vw: 1200,
      vh: 800,
    });
    expect(x).toBe(8);
    expect(y).toBe(246);
  });
});
