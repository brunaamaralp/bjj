import { describe, it, expect } from 'vitest';
import {
  buildLeadDocumentPermissions,
  LeadPermissionError,
} from '../lib/clientDocumentPermissions.js';
import {
  buildAcademyDocumentPermissions,
  AcademyPermissionError,
} from '../../lib/server/academyDocumentPermissions.js';

describe('buildLeadDocumentPermissions', () => {
  it('exige teamId e não usa Role.users()', () => {
    expect(() => buildLeadDocumentPermissions({ teamId: '', userId: 'u1' })).toThrow(LeadPermissionError);
    expect(() => buildLeadDocumentPermissions({ teamId: '', userId: 'u1' })).toThrow(/time configurado/);
  });

  it('retorna permissões team + user quando teamId presente', () => {
    const perms = buildLeadDocumentPermissions({ teamId: 'team-1', userId: 'user-1' });
    expect(perms.length).toBeGreaterThanOrEqual(3);
    const flat = JSON.stringify(perms);
    expect(flat).not.toContain('users');
  });
});

describe('buildAcademyDocumentPermissions', () => {
  it('lança AcademyPermissionError sem teamId quando requireTeam', () => {
    expect(() => buildAcademyDocumentPermissions({ ownerId: 'owner-1' })).toThrow(AcademyPermissionError);
    expect(() => buildAcademyDocumentPermissions({ ownerId: 'owner-1' })).toThrow(/time configurado/);
  });

  it('retorna owner + team sem fallback users', () => {
    const perms = buildAcademyDocumentPermissions({
      ownerId: 'owner-1',
      teamId: 'team-1',
    });
    expect(perms.length).toBe(6);
    const flat = JSON.stringify(perms);
    expect(flat).not.toContain('users');
  });
});
