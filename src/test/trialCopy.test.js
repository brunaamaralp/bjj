import { describe, it, expect } from 'vitest';
import { TRIAL_DAYS, trialMarketing } from '../lib/trialCopy.js';

describe('trialCopy', () => {
  it('marketing usa TRIAL_DAYS do billing', () => {
    expect(TRIAL_DAYS).toBe(30);
    expect(trialMarketing.ctaPrimary).toContain('30 dias');
    expect(trialMarketing.heroHint).toContain('30 dias');
    expect(trialMarketing.plansFree).toBe('30 dias grátis');
  });
});
