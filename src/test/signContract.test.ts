import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/autentique/autentiqueService.js', () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn().mockResolvedValue(true),
  signDocument: vi.fn(),
  getDocument: vi.fn(),
}));

vi.mock('../../lib/contracts/contractService.js', () => ({
  createContract: vi.fn(),
  saveSigners: vi.fn(),
}));

import { createDocument, signDocument, getDocument } from '../../lib/autentique/autentiqueService.js';
import { createContract, saveSigners } from '../../lib/contracts/contractService.js';
import { signContract } from '../../lib/signContract.js';

describe('signContract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('não chama Appwrite se Autentique falhar', async () => {
    vi.mocked(createDocument).mockRejectedValue(new Error('autentique_fail'));

    await expect(
      signContract({ name: 'Test', signers: [{ email: 'a@b.com', action: 'SIGN' }] }, Buffer.from('pdf'))
    ).rejects.toThrow('autentique_fail');

    expect(createContract).not.toHaveBeenCalled();
  });

  it('retorna documento Autentique se Appwrite falhar após criar', async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: 'aut-1',
      name: 'Test',
      signatures: [{ public_id: 'sig-1', email: 'a@b.com' }],
    });
    vi.mocked(createContract).mockRejectedValue(new Error('appwrite_fail'));

    const result = await signContract(
      { name: 'Test', signers: [{ email: 'a@b.com', action: 'SIGN' }] },
      Buffer.from('pdf')
    );

    expect(result.contract).toBeNull();
    expect(result.autentiqueDocument.id).toBe('aut-1');
    expect(result.appwriteError).toBe('appwrite_fail');
    expect(saveSigners).not.toHaveBeenCalled();
  });

  it('repassa positions e sortable para createDocument', async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: 'aut-2',
      name: 'Test',
      signatures: [
        { public_id: 'sig-1', email: 'a@b.com' },
        { public_id: 'sig-2', email: 'c@d.com' },
      ],
    });
    vi.mocked(createContract).mockResolvedValue({ $id: 'c1' } as never);
    vi.mocked(saveSigners).mockResolvedValue([] as never);

    await signContract(
      {
        name: 'Test',
        signers: [
          {
            email: 'a@b.com',
            action: 'SIGN',
            positions: [{ x: '25', y: '88', z: 2, element: 'SIGNATURE' }],
          },
          {
            email: 'c@d.com',
            action: 'SIGN',
            positions: [{ x: '75', y: '88', z: 2, element: 'SIGNATURE' }],
          },
        ],
      },
      Buffer.from('pdf')
    );

    expect(createDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        sortable: true,
        signers: expect.arrayContaining([
          expect.objectContaining({ positions: expect.any(Array) }),
        ]),
      })
    );
  });

  it('auto-assina academia e desliga sortable quando autoSignAcademy', async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: 'aut-3',
      name: 'Test',
      signatures: [
        { public_id: 'sig-a', email: 'acad@x.com' },
        { public_id: 'sig-b', email: 'aluno@x.com' },
      ],
    });
    vi.mocked(signDocument).mockResolvedValue({ id: 'aut-3' });
    vi.mocked(getDocument).mockResolvedValue({
      id: 'aut-3',
      signatures: [
        { public_id: 'sig-a', email: 'acad@x.com', signed: { created_at: '2026-01-01T00:00:00Z' } },
        { public_id: 'sig-b', email: 'aluno@x.com' },
      ],
    });
    vi.mocked(createContract).mockResolvedValue({ $id: 'c2' } as never);
    vi.mocked(saveSigners).mockResolvedValue([] as never);

    await signContract(
      {
        name: 'Test',
        autoSignAcademy: true,
        signers: [
          { email: 'aluno@x.com', action: 'SIGN' },
          { email: 'acad@x.com', action: 'SIGN' },
        ],
      },
      Buffer.from('pdf')
    );

    expect(createDocument).toHaveBeenCalledWith(expect.objectContaining({ sortable: false }));
    expect(signDocument).toHaveBeenCalledWith('aut-3');
    expect(createContract).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });
});
