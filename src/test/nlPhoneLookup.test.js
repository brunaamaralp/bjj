import { describe, expect, it } from 'vitest';
import { buildNlPhoneLookupResponse } from '../../lib/server/nlPhoneLookup.js';

describe('buildNlPhoneLookupResponse', () => {
  it('monta resposta vazia', () => {
    const out = buildNlPhoneLookupResponse([], '11999887766');
    expect(out.count).toBe(0);
    expect(out.query_type).toBe('find_by_phone');
    expect(out.rows).toEqual([]);
    expect(out.resposta).toMatch(/Não encontrei/);
  });

  it('monta rows clicáveis aluno/lead', () => {
    const out = buildNlPhoneLookupResponse(
      [
        { id: 's1', name: 'Ana', phone: '11999887766', kind: 'student' },
        { id: 'l1', name: 'Bruno', phone: '11999887766', kind: 'lead' },
      ],
      '11999887766'
    );
    expect(out.count).toBe(2);
    expect(out.rows[0]).toMatchObject({ id: 's1', linkKind: 'student', name: 'Ana' });
    expect(out.rows[1]).toMatchObject({ id: 'l1', linkKind: 'lead', name: 'Bruno' });
    expect(out.resposta).toMatch(/2 contatos/);
  });
});
