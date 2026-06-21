import { describe, expect, it } from 'vitest';
import { normalizeReportsOperatorTeam } from '../lib/reportsOperatorTeam.js';

describe('normalizeReportsOperatorTeam', () => {
  it('normaliza payload de memberships para chips e filtros de relatórios', () => {
    expect(
      normalizeReportsOperatorTeam({
        memberships: [
          { userId: 'u-1', name: 'Ana' },
          { user_id: 'u-2', email: 'bruno@nave.app' },
          { userId: '', name: 'Sem id' },
        ],
      })
    ).toEqual([
      { id: 'u-1', nome: 'Ana' },
      { id: 'u-2', nome: 'bruno@nave.app' },
    ]);
  });

  it('aceita lista já pronta sem quebrar os painéis', () => {
    expect(normalizeReportsOperatorTeam([{ id: 'u-1', nome: 'Ana' }])).toEqual([
      { id: 'u-1', nome: 'Ana' },
    ]);
  });
});
