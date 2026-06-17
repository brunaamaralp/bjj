/**
 * Contratos aguardando assinatura — entrada na Previsão.
 */
import { listContracts } from '../../lib/contracts/contractService.js';
import { mapContractDisplayStatus } from '../../lib/contracts/displayStatus.js';

function displayContext(c) {
  return {
    signersViewed: c.signersViewed ?? 0,
    expiresAt: c.expiresAt ?? null,
    metaStatus: c.metaStatus ?? null,
  };
}

export async function listContractsAwaitingForecast(academyId) {
  try {
    const { data } = await listContracts({ academy_id: academyId, limit: 100, page: 1 });
    return (data || []).filter((c) => {
      const d = mapContractDisplayStatus(
        c.status,
        c.signersSigned ?? 0,
        c.signersTotal ?? 0,
        displayContext(c)
      );
      return d === 'sent' || d === 'viewed';
    });
  } catch {
    return [];
  }
}
