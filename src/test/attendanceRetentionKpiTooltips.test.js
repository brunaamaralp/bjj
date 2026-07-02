import { describe, expect, it } from 'vitest';
import { attendanceRetentionKpiTooltips } from '../../src/lib/attendanceRetentionKpiTooltips.js';

describe('attendanceRetentionKpiTooltips', () => {
  it('expõe 3 tooltips alinhados à meta semanal', () => {
    const tips = attendanceRetentionKpiTooltips();
    expect(tips.at_risk).toMatch(/meta semanal/i);
    expect(tips.absent).toMatch(/15/);
    expect(tips.active).toMatch(/7 dias/i);
    expect(tips.queue).toBeUndefined();
  });
});
