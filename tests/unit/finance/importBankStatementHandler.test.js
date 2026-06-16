import { describe, expect, it } from 'vitest';
import { sanitizeBankStatementItems } from '../../../lib/server/importBankStatementHandler.js';

describe('importBankStatementHandler sanitize', () => {
  it('normalizes valid items', () => {
    const items = sanitizeBankStatementItems([
      { date: '2026-01-15', description: 'PIX', amount: 100, direction: 'credit' },
      { date: '15/01/2026', description: 'Boleto', amount: 50, direction: 'debit' },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].date).toBe('2026-01-15');
    expect(items[0].amount).toBe(100);
    expect(items[1].direction).toBe('debit');
  });

  it('skips invalid rows', () => {
    const items = sanitizeBankStatementItems([
      { date: '', amount: 10 },
      { date: '2026-01-01', amount: 0 },
      { date: 'bad', amount: 20 },
    ]);
    expect(items).toHaveLength(0);
  });

  it('infers direction from negative amount', () => {
    const items = sanitizeBankStatementItems([{ date: '2026-02-01', description: 'X', amount: -25 }]);
    expect(items[0].direction).toBe('debit');
    expect(items[0].amount).toBe(25);
  });

  it('caps at 500 items', () => {
    const raw = Array.from({ length: 600 }, (_, i) => ({
      date: '2026-01-01',
      description: `Line ${i}`,
      amount: 1,
      direction: 'credit',
    }));
    expect(sanitizeBankStatementItems(raw)).toHaveLength(500);
  });

  it('preserves low_confidence flag', () => {
    const items = sanitizeBankStatementItems([
      { date: '2026-01-15', description: 'PIX', amount: 100, direction: 'credit', low_confidence: true },
      { date: '2026-01-16', description: 'TED', amount: 50, direction: 'debit', low_confidence: false },
    ]);
    expect(items[0].low_confidence).toBe(true);
    expect(items[1].low_confidence).toBe(false);
  });
});
