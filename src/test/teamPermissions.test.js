import { describe, it, expect } from 'vitest';
import {
  canAddTeamMember,
  canEditTeamMember,
  canRemoveTeamMember,
  canResetTeamPassword,
  canEditField,
  canViewTeamManagement,
} from '../lib/teamPermissions.js';

describe('teamPermissions', () => {
  it('owner can manage all non-owner targets', () => {
    expect(canEditTeamMember('owner', 'admin', 'o1', 'a1')).toBe(true);
    expect(canEditTeamMember('owner', 'receptionist', 'o1', 'r1')).toBe(true);
    expect(canEditTeamMember('owner', 'owner', 'o1', 'o1')).toBe(false);
  });

  it('admin can only manage receptionists, not self or other admins', () => {
    expect(canEditTeamMember('admin', 'receptionist', 'a1', 'r1')).toBe(true);
    expect(canEditTeamMember('admin', 'admin', 'a1', 'a2')).toBe(false);
    expect(canEditTeamMember('admin', 'receptionist', 'a1', 'a1')).toBe(false);
  });

  it('receptionist cannot manage team', () => {
    expect(canViewTeamManagement('receptionist')).toBe(false);
    expect(canAddTeamMember('receptionist', 'receptionist')).toBe(false);
  });

  it('admin cannot add admin', () => {
    expect(canAddTeamMember('admin', 'receptionist')).toBe(true);
    expect(canAddTeamMember('admin', 'admin')).toBe(false);
    expect(canAddTeamMember('owner', 'admin')).toBe(true);
  });

  it('cannot reset own password via team actions', () => {
    expect(canResetTeamPassword('owner', 'admin', 'o1', 'o1')).toBe(false);
    expect(canResetTeamPassword('admin', 'receptionist', 'a1', 'r1')).toBe(true);
  });

  it('canEditField: only owner edits email; admin edits role on receptionists', () => {
    expect(canEditField('owner', 'admin', 'email', 'o1', 'a1')).toBe(true);
    expect(canEditField('admin', 'receptionist', 'email', 'a1', 'r1')).toBe(false);
    expect(canEditField('admin', 'receptionist', 'role', 'a1', 'r1')).toBe(true);
    expect(canEditField('admin', 'admin', 'role', 'a1', 'a2')).toBe(false);
    expect(canEditField('owner', 'owner', 'role', 'o1', 'o1')).toBe(false);
  });

  it('cannot remove self', () => {
    expect(canRemoveTeamMember('owner', 'admin', 'o1', 'o1')).toBe(false);
    expect(canRemoveTeamMember('admin', 'receptionist', 'a1', 'r1')).toBe(true);
  });
});
