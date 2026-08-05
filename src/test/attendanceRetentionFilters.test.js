import { describe, it, expect } from 'vitest';
import {
  URL_RET_STATUS,
  resolveRetentionStatusFilter,
  patchRetentionStatusParam,
  retentionStatusFilterLabel,
} from '../lib/attendanceRetentionFilters.js';

describe('attendanceRetentionFilters', () => {
  it('resolveRetentionStatusFilter', () => {
    expect(resolveRetentionStatusFilter('')).toBe('');
    expect(resolveRetentionStatusFilter('at_risk')).toBe('at_risk');
    expect(resolveRetentionStatusFilter('absent')).toBe('absent');
    expect(resolveRetentionStatusFilter('active')).toBe('');
  });

  it('patchRetentionStatusParam sets and clears', () => {
    const withFilter = patchRetentionStatusParam(new URLSearchParams('ret_turma=A'), 'absent');
    expect(withFilter.get(URL_RET_STATUS)).toBe('absent');
    expect(withFilter.get('ret_turma')).toBe('A');
    const cleared = patchRetentionStatusParam(withFilter, '');
    expect(cleared.get(URL_RET_STATUS)).toBeNull();
    expect(cleared.get('ret_turma')).toBe('A');
  });

  it('retentionStatusFilterLabel', () => {
    expect(retentionStatusFilterLabel('at_risk')).toBe('Em risco');
    expect(retentionStatusFilterLabel('absent')).toBe('Sumidos');
    expect(retentionStatusFilterLabel('')).toBe('');
  });
});
