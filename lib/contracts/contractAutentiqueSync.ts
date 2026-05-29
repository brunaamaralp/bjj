import { getDocument } from '../autentique/autentiqueService.js';
import {
  getContractById,
  updateContractStatus,
  updateSignerStatus,
} from './contractService.js';

function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function normalizePhone(value: string | null | undefined): string {
  return String(value || '').replace(/\D/g, '');
}

export async function syncContractFromAutentique(
  contractId: string,
  academyId: string
): Promise<{ ok: true; contractId: string } | { ok: false; error: string }> {
  const contract = await getContractById(contractId);
  if (!contract) return { ok: false, error: 'contract_not_found' };
  if (String(contract.academyId || '') !== String(academyId)) {
    return { ok: false, error: 'forbidden' };
  }
  const autentiqueId = String(contract.autentiqueId || '').trim();
  if (!autentiqueId) return { ok: false, error: 'autentique_id_missing' };

  const remote = await getDocument(autentiqueId);
  if (!remote) return { ok: false, error: 'autentique_document_not_found' };

  const signatures = remote.signatures || [];
  const allSigned = signatures.length > 0 && signatures.every((s) => Boolean(s.signed?.created_at));
  const anySigned = signatures.some((s) => Boolean(s.signed?.created_at));
  const anyViewed = signatures.some((s) => Boolean(s.viewed?.created_at));
  const anyRejected = signatures.some((s) => Boolean(s.rejected?.created_at));

  let status = contract.status;
  if (allSigned) status = 'finished';
  else if (anySigned) status = 'in_progress';
  else if (anyViewed) status = 'in_progress';
  else if (anyRejected) status = 'in_progress';

  await updateContractStatus(autentiqueId, status);

  for (const sig of signatures) {
    const publicId = String(sig.public_id || '').trim();
    if (!publicId) continue;
    let signerStatus = 'pending';
    if (sig.signed?.created_at) signerStatus = 'signed';
    else if (sig.rejected?.created_at) signerStatus = 'rejected';
    else if (sig.viewed?.created_at) signerStatus = 'viewed';
    await updateSignerStatus(publicId, signerStatus, sig.signed?.created_at || null);
  }

  return { ok: true, contractId };
}

export function matchInputSignerToAutentiqueSignature(
  input: { email?: string; phone?: string; name?: string },
  signatures: Array<{ public_id: string; email?: string | null; name?: string | null }>,
  usedIds: Set<string>
): { public_id: string; email?: string | null; name?: string | null } | null {
  const email = normalizeEmail(input.email);
  if (email) {
    const hit = signatures.find(
      (s) => !usedIds.has(s.public_id) && normalizeEmail(s.email) === email
    );
    if (hit) return hit;
  }

  const name = String(input.name || '').trim().toLowerCase();
  if (name) {
    const hit = signatures.find(
      (s) => !usedIds.has(s.public_id) && String(s.name || '').trim().toLowerCase() === name
    );
    if (hit) return hit;
  }

  const unused = signatures.find((s) => !usedIds.has(s.public_id));
  return unused || null;
}
