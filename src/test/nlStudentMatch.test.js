import { describe, expect, it } from 'vitest';
import { suggestPeopleByPhone, suggestStudentsByName } from '../../lib/nlStudentMatch.js';

describe('suggestStudentsByName', () => {
  it('ranqueia por nome', () => {
    const people = [
      { id: '1', name: 'Ana Silva' },
      { id: '2', name: 'Bruno' },
    ];
    expect(suggestStudentsByName('Ana', people).map((p) => p.id)).toEqual(['1']);
  });
});

describe('suggestPeopleByPhone', () => {
  const people = [
    { id: 's1', name: 'Ana', phone: '11999887766', kind: 'student' },
    { id: 'l1', name: 'Bruno Lead', phone: '11988776655', kind: 'lead' },
    { id: 's2', name: 'Carla', phone: '21977665544', kind: 'student' },
  ];

  it('retorna vazio com menos de 8 dígitos', () => {
    expect(suggestPeopleByPhone('887766', people)).toEqual([]);
  });

  it('acha aluno e lead por dígitos (≥8)', () => {
    const hits = suggestPeopleByPhone('(11) 99988-7766', people);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: 's1', name: 'Ana', kind: 'student', phone: '11999887766' });
  });

  it('aceita sufixo de 8+ dígitos', () => {
    const hits = suggestPeopleByPhone('988776655', people);
    expect(hits.map((h) => h.id)).toEqual(['l1']);
  });

  it('respeita limit', () => {
    const many = [
      { id: 'a', name: 'A', phone: '11999990001' },
      { id: 'b', name: 'B', phone: '11999990001' },
      { id: 'c', name: 'C', phone: '11999990001' },
    ];
    expect(suggestPeopleByPhone('11999990001', many, 2)).toHaveLength(2);
  });
});
