import { Query } from 'node-appwrite';
import { ensureAuth, databases } from './academyAccess.js';
import { DB_ID, STUDENT_PAYMENTS_COL } from './appwriteCollections.js';
import { resolvePortalStudentAccess, PORTAL_FORBIDDEN } from './portalAccess.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function mapPortalPayment(doc) {
  const st = String(doc.status || 'pending').toLowerCase();
  const key = st === 'covered' || st === 'frozen' ? 'paid' : st || 'pending';
  return {
    id: doc.$id,
    reference_month: String(doc.reference_month || '').slice(0, 7),
    status: st,
    display_status: key,
    amount: Number(doc.amount ?? doc.paid_amount ?? 0) || 0,
    due_date: String(doc.due_date || doc.dueDate || '').slice(0, 10) || null,
    payment_method: String(doc.payment_method || doc.paymentMethod || '').trim() || null,
    paid_at: doc.paid_at || doc.paidAt || null,
  };
}

function computeCurrentPaymentStatus(payments) {
  const ym = new Date().toISOString().slice(0, 7);
  const current = payments.find((p) => p.reference_month === ym);
  if (!current) return { key: 'none', reference_month: ym };
  return { key: current.display_status, reference_month: ym };
}

export default async function portalFinanceHandler(req, res) {
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
    if (!STUDENT_PAYMENTS_COL) {
      return json(res, 200, {
        sucesso: true,
        paymentStatus: { key: 'none', reference_month: new Date().toISOString().slice(0, 7) },
        payments: [],
      });
    }

    const list = await databases.listDocuments(DB_ID, STUDENT_PAYMENTS_COL, [
      Query.equal('lead_id', studentId),
      Query.equal('academy_id', academyId),
      Query.orderDesc('reference_month'),
      Query.limit(24),
    ]);

    const payments = (list.documents || []).map(mapPortalPayment);
    return json(res, 200, {
      sucesso: true,
      paymentStatus: computeCurrentPaymentStatus(payments),
      payments,
    });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-finance]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'finance_failed' });
  }
}
