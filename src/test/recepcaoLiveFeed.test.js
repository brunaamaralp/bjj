import { describe, it, expect } from 'vitest';
import { countRealFeedEntries } from '../lib/recepcaoLiveFeed.js';

describe('countRealFeedEntries', () => {
  it('conta só presenças reais (exclui manual e ignorada)', () => {
    const feed = [
      { $id: '1', source: 'catraca' },
      { $id: '2', source: 'manual', _isManual: true },
      { $id: '3', source: 'ignored', _isIgnored: true, ignore_reason: 'cooldown' },
      { $id: '4', student_name: 'Ana' },
      { $id: '5', _isManual: true },
      { $id: '6', _isIgnored: true },
    ];
    expect(countRealFeedEntries(feed)).toBe(2);
  });

  it('retorna 0 para feed vazio ou inválido', () => {
    expect(countRealFeedEntries([])).toBe(0);
    expect(countRealFeedEntries(null)).toBe(0);
    expect(countRealFeedEntries(undefined)).toBe(0);
  });
});
