import { describe, it, expect } from 'vitest';
import { buildQuickNotePersonOptions } from '../lib/quickNotePersonOptions.js';

describe('buildQuickNotePersonOptions', () => {
  it('mistura leads e alunos e deduplica preferindo aluno', () => {
    const options = buildQuickNotePersonOptions(
      [
        { id: 'l1', name: 'Ana', phone: '11999999999' },
        { id: 's1', name: 'Bruno Lead', contact_type: 'student' },
      ],
      [{ id: 's1', name: 'Bruno', phone: '11888888888' }]
    );

    expect(options).toEqual([
      {
        value: 'l1',
        label: 'Ana (Lead)',
        searchText: 'Ana 11999999999',
        kind: 'lead',
      },
      {
        value: 's1',
        label: 'Bruno (Aluno)',
        searchText: 'Bruno 11888888888',
        kind: 'student',
      },
    ]);
  });

  it('ignora entradas sem id', () => {
    expect(buildQuickNotePersonOptions([{ name: 'X' }], [{ name: 'Y' }])).toEqual([]);
  });
});
