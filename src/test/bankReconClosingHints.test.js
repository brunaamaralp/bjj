import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/server/financeClosingData.js', () => ({
  getCashClosing: vi.fn(),
}));

import { getCashClosing } from '../../lib/server/financeClosingData.js';
import { buildClosingHintsForStatement } from '../../lib/server/bankReconClosingHints.js';

describe('buildClosingHintsForStatement', () => {
  beforeEach(() => {
    vi.mocked(getCashClosing).mockReset();
  });

  it('retorna null quando período inválido', async () => {
    const out = await buildClosingHintsForStatement({
      academyId: 'a1',
      periodStart: '',
      periodEnd: '',
    });
    expect(out).toBeNull();
    expect(getCashClosing).not.toHaveBeenCalled();
  });

  it('marca all_conferred quando todos os meses têm cash_closing', async () => {
    vi.mocked(getCashClosing).mockResolvedValue({ closed_at: '2026-04-01T12:00:00.000Z' });
    const out = await buildClosingHintsForStatement({
      academyId: 'a1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    });
    expect(out?.all_conferred).toBe(true);
    expect(out?.any_conferred).toBe(true);
    expect(out?.months).toHaveLength(1);
    expect(out?.months[0].is_conferred).toBe(true);
  });

  it('marca pending quando mês sem fechamento', async () => {
    vi.mocked(getCashClosing).mockResolvedValue(null);
    const out = await buildClosingHintsForStatement({
      academyId: 'a1',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    });
    expect(out?.all_conferred).toBe(false);
    expect(out?.any_conferred).toBe(false);
    expect(out?.months[0].is_conferred).toBe(false);
  });

  it('cobre múltiplos meses civis', async () => {
    vi.mocked(getCashClosing)
      .mockResolvedValueOnce({ closed_at: '2026-03-05T10:00:00.000Z' })
      .mockResolvedValueOnce(null);
    const out = await buildClosingHintsForStatement({
      academyId: 'a1',
      periodStart: '2026-02-20',
      periodEnd: '2026-03-10',
    });
    expect(out?.months).toHaveLength(2);
    expect(out?.all_conferred).toBe(false);
    expect(out?.any_conferred).toBe(true);
  });
});
