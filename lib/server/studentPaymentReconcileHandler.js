/**
 * POST /api/finance?route=payment-reconcile — titular/admin, uma academia.
 */
import { ensureAuth, ensureAcademyOwnerOrAdmin } from './academyAccess.js';
import { reconcileStudentPaymentMirrorsForAcademy } from './studentPaymentReconcileCore.js';

function json(res, status, body) {
  res.status(status).json(body);
}

export default async function studentPaymentReconcileHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;

  const { academyId, doc: academyDoc } = access;
  try {
    const result = await reconcileStudentPaymentMirrorsForAcademy(academyId, academyDoc, {
      notifyOnFailure: false,
    });
    return json(res, 200, { ok: true, ...result });
  } catch (e) {
    console.error('[studentPaymentReconcile]', e);
    return json(res, 500, { ok: false, error: 'reconcile_failed' });
  }
}
