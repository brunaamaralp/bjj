import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/autentique/autentiqueService.js', () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/contracts/contractService.js', () => ({
  createContract: vi.fn(),
  saveSigners: vi.fn(),
}));

import { createDocument } from '../../lib/autentique/autentiqueService.js';
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
});
