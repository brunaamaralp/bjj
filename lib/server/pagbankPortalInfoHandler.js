import { Query } from 'node-appwrite';
import { ensurePortalToken } from './ensurePortalToken.js';
import { databases, DB_ID, ACADEMIES_COL } from './academyAccess.js';

const PLANS_COL =
  process.env.PAGBANK_PLANS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_PLANS_COLLECTION_ID ||
  'pagbank_plans';

const SUBSCRIPTIONS_COL =
  process.env.PAGBANK_SUBSCRIPTIONS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  process.env.APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  'pagbank_subscriptions';

const FREQ_LABELS = {
  monthly: 'por mês',
  quarterly: 'por trimestre',
  semiannual: 'por semestre',
  annual: 'por ano',
};

async function findActiveSubscription(studentId, academyId) {
  const res = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COL, [
    Query.equal('student_id', studentId),
    Query.equal('academy_id', academyId),
    Query.notEqual('status', 'canceled'),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function findPlan(planInternalKey, academyId) {
  const res = await databases.listDocuments(DB_ID, PLANS_COL, [
    Query.equal('internal_key', planInternalKey),
    Query.equal('academy_id', academyId),
    Query.equal('active', true),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

async function resolveAcademyName(academyId) {
  if (!ACADEMIES_COL || !academyId) return 'Academia';
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    return String(doc?.name || doc?.academyName || 'Academia').trim() || 'Academia';
  } catch {
    return 'Academia';
  }
}

function buildPlanInfo(planDoc) {
  const frequency = String(planDoc?.frequency || 'monthly').trim().toLowerCase();
  return {
    plan_name: String(planDoc?.name || planDoc?.internal_key || '').trim(),
    plan_amount: Number(planDoc?.amount) || 0,
    plan_frequency: FREQ_LABELS[frequency] || FREQ_LABELS.monthly,
  };
}

export default async function pagbankPortalInfoHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!PLANS_COL || !DB_ID) {
    return res.status(503).json({ error: 'server_misconfigured' });
  }

  const portal = await ensurePortalToken(req, res);
  if (!portal.payload) return;

  const { student_id: studentId, academy_id: academyId, plan_internal_key: planInternalKey } =
    portal.payload;

  const [planDoc, existingSub, academyName] = await Promise.all([
    findPlan(planInternalKey, academyId),
    findActiveSubscription(studentId, academyId),
    resolveAcademyName(academyId),
  ]);

  if (!planDoc) {
    return res.status(404).json({ error: 'plan_not_found' });
  }

  const planInfo = buildPlanInfo(planDoc);
  const base = {
    student_name: String(portal.payload.student_name || '').trim(),
    academy_name: academyName,
    ...planInfo,
  };

  if (existingSub) {
    return res.status(200).json({
      ...base,
      already_subscribed: true,
      subscription_id: existingSub.subscription_id,
      status: existingSub.status,
    });
  }

  return res.status(200).json({
    ...base,
    already_subscribed: false,
  });
}
