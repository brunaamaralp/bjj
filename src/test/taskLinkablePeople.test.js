import { describe, it, expect } from 'vitest';
import {
  buildTaskLinkablePeople,
  filterTaskLinkablePeople,
  profilePathForLinkablePerson,
} from '../lib/taskLinkablePeople.js';

describe('taskLinkablePeople', () => {
  it('mescla leads e students sem duplicar id', () => {
    const people = buildTaskLinkablePeople(
      [{ id: 'a', name: 'Lead A', phone: '11' }],
      [{ id: 'b', name: 'Aluno B', phone: '22' }, { id: 'a', name: 'Aluno A', phone: '11' }]
    );
    expect(people).toHaveLength(2);
    expect(people.find((p) => p.id === 'a')?.kind).toBe('student');
    expect(people.find((p) => p.id === 'b')?.name).toBe('Aluno B');
  });

  it('filtra por nome e telefone', () => {
    const all = buildTaskLinkablePeople([], [{ id: '1', name: 'Maria Silva', phone: '11999' }]);
    expect(filterTaskLinkablePeople(all, 'silva')).toHaveLength(1);
    expect(filterTaskLinkablePeople(all, '999')).toHaveLength(1);
    expect(filterTaskLinkablePeople(all, 'joao')).toHaveLength(0);
  });

  it('profilePath diferencia lead e student', () => {
    expect(profilePathForLinkablePerson({ id: 'x', kind: 'lead' })).toBe('/lead/x');
    expect(profilePathForLinkablePerson({ id: 'x', kind: 'student' })).toBe('/student/x');
  });
});
