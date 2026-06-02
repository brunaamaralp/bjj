import type { SignerInput } from './types.js';
import type { ContractSignerLayout } from './contractSignerLayout.js';
import { fetchAcademyDoc } from './contractLeadAccess.js';
function needsPhone(method: string | undefined): boolean {
  const m = String(method || '').trim();
  return m === 'DELIVERY_METHOD_WHATSAPP' || m === 'DELIVERY_METHOD_SMS';
}

function isContratadaSlot(label: string): boolean {
  return String(label || '')
    .trim()
    .toLowerCase()
    .includes('contratada');
}

/**
 * Preenche e-mail/nome da contratada a partir do cadastro da academia quando o cliente não enviou.
 */
export async function enrichContractSignersFromAcademy(
  signers: SignerInput[],
  layout: ContractSignerLayout | null | undefined,
  academyId: string
): Promise<SignerInput[]> {
  const slots = (layout?.slots || []).filter((s) => s.enabled !== false);
  const academy = await fetchAcademyDoc(academyId);
  if (!academy) return signers;

  const academyEmail = String(academy.email || '').trim();
  const academyName = String(academy.name || '').trim();

  return signers.map((signer, index) => {
    const label = String(slots[index]?.label || '');
    if (!isContratadaSlot(label)) return signer;

    const next: SignerInput = { ...signer };
    if (!String(next.name || '').trim() && academyName) {
      next.name = academyName;
    }
    if (needsPhone(next.delivery_method)) return next;

    if (!String(next.email || '').trim() && academyEmail) {
      next.email = academyEmail;
    }
    return next;
  });
}
