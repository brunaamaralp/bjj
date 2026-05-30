import { describe, expect, it } from 'vitest';
import {
  contratadaSlotEnabled,
  findContratadaSignerIndex,
  maskEmailForDisplay,
  validateAcademyAutoSign,
} from '../../lib/contracts/autentiqueAutoSign.js';
import { defaultContractSignerLayout } from '../../lib/contracts/contractSignerLayout.js';

describe('autentiqueAutoSign', () => {
  it('detects contratada slot', () => {
    expect(contratadaSlotEnabled(defaultContractSignerLayout())).toBe(true);
  });

  it('finds contratada at index 1', () => {
    expect(findContratadaSignerIndex(defaultContractSignerLayout())).toBe(1);
  });

  it('validates matching contratada email', () => {
    const layout = defaultContractSignerLayout();
    const result = validateAcademyAutoSign({
      layout,
      accountEmail: 'owner@academia.com',
      signers: [
        { name: 'Aluno', email: 'aluno@test.com', action: 'SIGN' },
        { name: 'Academia', email: 'owner@academia.com', action: 'SIGN' },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects when contratada email differs from account', () => {
    const layout = defaultContractSignerLayout();
    const result = validateAcademyAutoSign({
      layout,
      accountEmail: 'owner@academia.com',
      signers: [
        { name: 'Aluno', email: 'aluno@test.com', action: 'SIGN' },
        { name: 'Academia', email: 'outro@academia.com', action: 'SIGN' },
      ],
    });
    expect(result.ok).toBe(false);
  });

  it('masks email for display', () => {
    expect(maskEmailForDisplay('mateus@example.com')).toMatch(/ma•••@e•••\.com/);
  });
});
