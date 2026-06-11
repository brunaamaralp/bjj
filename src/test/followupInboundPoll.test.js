import { describe, expect, it } from 'vitest';
import { getInboundPollMs } from '../lib/followupInboundPoll.js';

describe('getInboundPollMs', () => {
  it('aba oculta — sem poll', () => {
    expect(getInboundPollMs(true, true)).toBeNull();
    expect(getInboundPollMs(false, true)).toBeNull();
  });

  it('realtime ativo — poll longo', () => {
    expect(getInboundPollMs(true, false)).toBe(120_000);
  });

  it('realtime inativo — poll curto', () => {
    expect(getInboundPollMs(false, false)).toBe(45_000);
  });
});
