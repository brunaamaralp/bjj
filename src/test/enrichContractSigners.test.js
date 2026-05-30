import { describe, it, expect, vi, beforeEach } from 'vitest';
import { enrichContractSignersFromAcademy } from '../../lib/contracts/enrichContractSigners.ts';

vi.mock('../../lib/contracts/contractLeadAccess.js', () => ({
  fetchAcademyDoc: vi.fn(),
}));

import { fetchAcademyDoc } from '../../lib/contracts/contractLeadAccess.js';

describe('enrichContractSignersFromAcademy', () => {
  beforeEach(() => {
    vi.mocked(fetchAcademyDoc).mockReset();
  });

  it('preenche e-mail da contratada a partir da academia', async () => {
    vi.mocked(fetchAcademyDoc).mockResolvedValue({
      email: 'academia@example.com',
      name: 'Team BJJ',
    });

    const layout = {
      version: 1,
      slots: [
        { label: 'Contratante', enabled: true },
        { label: 'Contratada', enabled: true },
      ],
    };

    const signers = [
      { name: 'Aluno', email: 'aluno@example.com', delivery_method: 'DELIVERY_METHOD_EMAIL' },
      { name: '', email: '', delivery_method: 'DELIVERY_METHOD_EMAIL' },
    ];

    const out = await enrichContractSignersFromAcademy(signers, layout, 'acad-1');
    expect(out[1].email).toBe('academia@example.com');
    expect(out[1].name).toBe('Team BJJ');
  });
});
