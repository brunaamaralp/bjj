import { describe, expect, it } from 'vitest';
import {
  BELT_HISTORY_MAX,
  buildBeltHistoryPatch,
  deriveBeltFields,
  ensureBeltHistorySeeded,
  parseBeltHistoryJson,
  seedBeltHistoryFromLegacy,
  serializeBeltHistory,
  sortBeltHistory,
  studentMatchesBeltSinceMonths,
} from '../lib/beltHistory.js';

describe('parseBeltHistoryJson / serializeBeltHistory', () => {
  it('parseia array válido e ignora entradas inválidas', () => {
    const raw = JSON.stringify([
      { id: 'a', belt: 'Azul', date: '2024-01-15' },
      { id: '', belt: 'Roxa', date: '2025-06-01' },
      { belt: '  ', date: '2025-01-01' },
      null,
    ]);
    const parsed = parseBeltHistoryJson(raw);
    expect(parsed).toEqual([{ id: 'a', belt: 'Azul', date: '2024-01-15' }]);
  });

  it('serialize arredonda trip round-trip', () => {
    const entries = [{ id: '1', belt: 'Branca', date: '' }];
    expect(parseBeltHistoryJson(serializeBeltHistory(entries))).toEqual(entries);
  });
});

describe('sortBeltHistory', () => {
  it('ordena por date asc; sem data no início; empate por id', () => {
    const sorted = sortBeltHistory([
      { id: 'c', belt: 'Preta', date: '2025-01-01' },
      { id: 'a', belt: 'Branca', date: '' },
      { id: 'b', belt: 'Azul', date: '2024-06-01' },
      { id: 'd', belt: 'Roxa', date: '2025-01-01' },
    ]);
    expect(sorted.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('deriveBeltFields', () => {
  it('usa a última entrada ordenada', () => {
    expect(
      deriveBeltFields([
        { id: '1', belt: 'Branca', date: '2020-01-01' },
        { id: '2', belt: 'Azul', date: '2023-05-10' },
      ])
    ).toEqual({ belt: 'Azul', beltSince: '2023-05-10' });
  });

  it('histórico vazio limpa belt e beltSince', () => {
    expect(deriveBeltFields([])).toEqual({ belt: '', beltSince: '' });
  });
});

describe('seedBeltHistoryFromLegacy / ensureBeltHistorySeeded', () => {
  it('seed cria uma entrada com enrollmentDate', () => {
    const entries = seedBeltHistoryFromLegacy({ belt: 'Azul', enrollmentDate: '2022-03-01' });
    expect(entries).toHaveLength(1);
    expect(entries[0].belt).toBe('Azul');
    expect(entries[0].date).toBe('2022-03-01');
    expect(entries[0].id).toBeTruthy();
  });

  it('ensure não seeda se já há histórico', () => {
    const student = {
      belt: 'Roxa',
      enrollmentDate: '2020-01-01',
      beltHistory: [{ id: 'x', belt: 'Azul', date: '2021-01-01' }],
    };
    const result = ensureBeltHistorySeeded(student);
    expect(result.didSeed).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.belt).toBe('Azul');
  });

  it('ensure seeda quando belt preenchido e histórico vazio', () => {
    const result = ensureBeltHistorySeeded({
      belt: 'Branca',
      enrollmentDate: '2021-08-12',
      beltHistory: [],
    });
    expect(result.didSeed).toBe(true);
    expect(result.entries).toHaveLength(1);
    expect(result.belt).toBe('Branca');
    expect(result.beltSince).toBe('2021-08-12');
  });
});

describe('buildBeltHistoryPatch', () => {
  it('respeita cap e deriva campos', () => {
    const entries = Array.from({ length: BELT_HISTORY_MAX }, (_, i) => ({
      id: `id-${i}`,
      belt: 'Azul',
      date: `2020-01-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    const ok = buildBeltHistoryPatch(entries);
    expect(ok.ok).toBe(true);
    expect(ok.patch.belt).toBe('Azul');
    expect(ok.patch.belt_history_json).toBeTruthy();
    expect(ok.patch.belt_since).toBeTruthy();

    const over = buildBeltHistoryPatch([
      ...entries,
      { id: 'extra', belt: 'Roxa', date: '2030-01-01' },
    ]);
    expect(over.ok).toBe(false);
    expect(over.error).toMatch(/50/i);
  });
});

describe('studentMatchesBeltSinceMonths', () => {
  it('exige belt_since e compara N meses', () => {
    expect(studentMatchesBeltSinceMonths({ beltSince: '' }, 6, '2026-10-26')).toBe(false);
    expect(studentMatchesBeltSinceMonths({ beltSince: '2026-08-01' }, 6, '2026-10-26')).toBe(false);
    expect(studentMatchesBeltSinceMonths({ beltSince: '2026-01-01' }, 6, '2026-10-26')).toBe(true);
    expect(studentMatchesBeltSinceMonths({ belt_since: '2025-10-26' }, 12, '2026-10-26')).toBe(true);
  });

  it('filtro desligado (null/0) sempre true', () => {
    expect(studentMatchesBeltSinceMonths({ beltSince: '' }, null, '2026-10-26')).toBe(true);
    expect(studentMatchesBeltSinceMonths({ beltSince: '' }, 0, '2026-10-26')).toBe(true);
  });
});
