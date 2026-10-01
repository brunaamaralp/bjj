import { describe, expect, it } from 'vitest';
import { personDocMatchesAcademy } from '../../lib/server/profileNoteHandler.js';

describe('personDocMatchesAcademy', () => {
  const aid = 'acad_1';

  it('aceita academyId (students / leads camelCase)', () => {
    expect(personDocMatchesAcademy({ academyId: aid }, aid)).toBe(true);
  });

  it('aceita academy_id (leads snake_case)', () => {
    expect(personDocMatchesAcademy({ academy_id: aid }, aid)).toBe(true);
  });

  it('prefere academyId quando ambos existem', () => {
    expect(personDocMatchesAcademy({ academyId: aid, academy_id: 'other' }, aid)).toBe(true);
  });

  it('rejeita academia diferente ou doc vazio', () => {
    expect(personDocMatchesAcademy({ academyId: 'other' }, aid)).toBe(false);
    expect(personDocMatchesAcademy({}, aid)).toBe(false);
    expect(personDocMatchesAcademy(null, aid)).toBe(false);
    expect(personDocMatchesAcademy({ academyId: aid }, '')).toBe(false);
  });
});
