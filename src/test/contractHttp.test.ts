import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/signContract.js', () => ({
  signContract: vi.fn(),
}));

vi.mock('../../lib/autentique/autentiqueService.js', () => ({
  deleteDocument: vi.fn(),
}));

vi.mock('../../lib/contracts/contractService.js', () => ({
  getContractById: vi.fn(),
  listContracts: vi.fn(),
  isContractStoreConfigured: vi.fn(() => true),
  cancelContractById: vi.fn(),
}));

vi.mock('../../lib/contracts/parseContractForm.js', () => ({
  ContractFormError: class ContractFormError extends Error {
    statusCode;
    constructor(message: string, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  parseContractFormData: vi.fn(),
}));

vi.mock('../../lib/contracts/validateContractSigners.js', () => ({
  validateContractSigners: vi.fn(),
}));

vi.mock('../../lib/contracts/validateSignersForAutentique.js', () => ({
  validateSignersForAutentique: vi.fn(),
}));

vi.mock('../../lib/autentique/parseAutentiqueErrors.js', () => ({
  formatAutentiqueValidationDetail: vi.fn(() => ''),
}));

vi.mock('../../lib/contracts/contractSendDiagnostics.js', () => ({
  autentiqueValidationFallbackHints: vi.fn(() => []),
  diagnoseContractSend: vi.fn(() => ({ blockers: [] })),
}));

vi.mock('../../lib/contracts/resolveContractPdf.js', () => ({
  resolveContractPdfBuffer: vi.fn(),
}));

vi.mock('../../lib/contracts/contractSignerLayout.js', () => ({
  applyLayoutToSigners: vi.fn((signers) => signers),
  countEnabledSignerSlots: vi.fn(() => 1),
}));

vi.mock('../../lib/contracts/contractAutentiqueSync.js', () => ({
  syncContractFromAutentique: vi.fn(),
}));

vi.mock('../../lib/contracts/contractLeadAccess.js', () => ({
  fetchLeadPersonForContract: vi.fn(() => null),
  fetchAcademyDoc: vi.fn(() => ({ name: 'Academia Teste', settings: '{}' })),
}));

vi.mock('../../lib/contracts/buildAutentiqueDocumentMeta.js', () => ({
  buildAutentiqueDocumentName: vi.fn(() => 'Contrato teste'),
  buildAutentiqueSignerMessage: vi.fn(() => 'Mensagem'),
}));

vi.mock('../../lib/contracts/autentiqueAutoSign.js', () => ({
  maskEmailForDisplay: vi.fn(() => ''),
  resolveAutentiqueAccountEmail: vi.fn(() => ''),
  validateAcademyAutoSign: vi.fn(() => ({ ok: true })),
}));

vi.mock('../../lib/contracts/contractSignaturePolicy.js', () => ({
  resolveSignatureDeadlineDays: vi.fn(() => 7),
  computeContractExpiresAt: vi.fn(() => '2026-07-01T00:00:00.000Z'),
  isPastIso: vi.fn(() => false),
}));

vi.mock('../../lib/contracts/contractStructuredLog.js', () => ({
  logContractStructured: vi.fn(),
}));

vi.mock('../../lib/contracts/enrichContractSigners.js', () => ({
  enrichContractSignersFromAcademy: vi.fn(async (signers) => signers),
}));

import { signContract } from '../../lib/signContract.js';
import { deleteDocument } from '../../lib/autentique/autentiqueService.js';
import {
  cancelContractById,
  getContractById,
} from '../../lib/contracts/contractService.js';
import { parseContractFormData } from '../../lib/contracts/parseContractForm.js';
import { resolveContractPdfBuffer } from '../../lib/contracts/resolveContractPdf.js';
import { syncContractFromAutentique } from '../../lib/contracts/contractAutentiqueSync.js';
import {
  handleGetContractById,
  handlePatchContract,
  handlePostContract,
} from '../../lib/contracts/contractHttp.ts';

const auth = {
  academyId: 'acad-1',
  userId: 'user-1',
  isOwner: true,
};

describe('contractHttp autentique config guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(parseContractFormData).mockResolvedValue({
      name: 'Contrato teste',
      signers: [{ email: 'aluno@x.com', action: 'SIGN' }],
      template_id: 'tpl-1',
      lead_id: 'lead-1',
      contract_purpose: 'default',
      auto_sign_academy: false,
      sandbox: false,
    } as never);

    vi.mocked(resolveContractPdfBuffer).mockResolvedValue({
      buffer: Buffer.from('pdf'),
      pageCount: 1,
      template: { $id: 'tpl-1', purpose: 'default', signerLayout: [] },
    } as never);
  });

  it('retorna 400 amigável ao enviar contrato sem token da academia', async () => {
    vi.mocked(signContract).mockRejectedValue(
      new Error('autentique_not_configured_for_academy')
    );

    const form = new FormData();
    form.append('name', 'Contrato');
    form.append('template_id', 'tpl-1');
    form.append('signers', JSON.stringify([{ email: 'aluno@x.com', action: 'SIGN' }]));

    const res = await handlePostContract(form, auth);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('autentique_not_configured_for_academy');
    expect(body.error).toContain('Conecte a conta Autentique da academia');
  });

  it('retorna 400 no sync sem token próprio', async () => {
    vi.mocked(syncContractFromAutentique).mockResolvedValue({
      ok: false,
      error: 'autentique_not_configured_for_academy',
    });

    const res = await handleGetContractById('contract-1', auth, new URLSearchParams('sync=1'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('autentique_not_configured_for_academy');
  });

  it('retorna 400 no cancelamento sem token próprio', async () => {
    vi.mocked(getContractById).mockResolvedValue({
      $id: 'contract-1',
      academyId: 'acad-1',
      leadId: 'lead-1',
      autentiqueId: 'aut-1',
    } as never);
    vi.mocked(deleteDocument).mockRejectedValue(
      new Error('autentique_not_configured_for_academy')
    );

    const res = await handlePatchContract('contract-1', { action: 'cancel' }, auth);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('autentique_not_configured_for_academy');
    expect(cancelContractById).not.toHaveBeenCalled();
  });
});
