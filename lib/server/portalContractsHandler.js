import { ensureAuth, databases } from './academyAccess.js';
import { resolvePortalStudentAccess, PORTAL_FORBIDDEN } from './portalAccess.js';
import { listContracts, isContractStoreConfigured } from '../contracts/contractService.ts';
import { mapContractDisplayStatus } from '../contracts/displayStatus.js';
import { resolveSignerShortLink } from '../contracts/signersLinks.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function contractDisplayContext(c) {
  return {
    signersViewed: c.signersViewed ?? 0,
    expiresAt: c.expiresAt ?? null,
    metaStatus: c.metaStatus ?? null,
  };
}

function mapPortalContract(c, userEmail) {
  const displayStatus = mapContractDisplayStatus(
    c.status,
    c.signersSigned ?? 0,
    c.signersTotal ?? 0,
    contractDisplayContext(c)
  );
  const signUrl = resolveSignerShortLink({ email: userEmail }, c.signersLinks || []);
  return {
    id: c.$id,
    name: c.name || 'Contrato',
    display_status: displayStatus,
    sign_url: signUrl,
    expires_at: c.expiresAt || null,
    created_at: c.createdAt || null,
    signers_signed: c.signersSigned ?? 0,
    signers_total: c.signersTotal ?? 0,
  };
}

const PENDING_STATUSES = new Set(['sent', 'viewed']);

export default async function portalContractsHandler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;

  const studentId = String(req.query?.student_id || '').trim();
  if (!studentId) return json(res, 400, { sucesso: false, erro: 'student_id_required' });

  try {
    const { academyId } = await resolvePortalStudentAccess(databases, me.$id, studentId);

    if (!isContractStoreConfigured()) {
      return json(res, 200, { sucesso: true, contracts: [] });
    }

    const result = await listContracts({
      academy_id: academyId,
      lead_id: studentId,
      limit: 50,
      page: 1,
    });

    const userEmail = String(me.email || '').trim().toLowerCase();
    const contracts = (result.data || [])
      .map((c) => mapPortalContract(c, userEmail))
      .filter((c) => PENDING_STATUSES.has(c.display_status));

    return json(res, 200, { sucesso: true, contracts });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-contracts]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'contracts_failed' });
  }
}
