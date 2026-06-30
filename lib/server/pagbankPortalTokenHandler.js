import { Query } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, databases, DB_ID } from './academyAccess.js';
import { getPortalJwtSecret, signPortalJwt, PORTAL_JWT_PURPOSE } from './portalJwt.js';

const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID ||
  process.env.APPWRITE_STUDENTS_COLLECTION_ID ||
  '';

const PLANS_COL =
  process.env.PAGBANK_PLANS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_PLANS_COLLECTION_ID ||
  'pagbank_plans';

const SUBSCRIPTIONS_COL =
  process.env.PAGBANK_SUBSCRIPTIONS_COL ||
  process.env.VITE_APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  process.env.APPWRITE_PAGBANK_SUBSCRIPTIONS_COLLECTION_ID ||
  'pagbank_subscriptions';

function resolveAppUrl() {
  const raw = String(
    process.env.VITE_APP_URL || process.env.APP_URL || process.env.VERCEL_URL || ''
  ).trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, '');
  return `https://${raw.replace(/\/$/, '')}`;
}

const TOKEN_TTL_HOURS = 48;

function parseJsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      return { error: 'invalid_json' };
    }
  }
  if (!body || typeof body !== 'object') {
    return { error: 'invalid_json' };
  }
  return { body };
}

async function findActiveSubscription(studentId, academyId) {
  const res = await databases.listDocuments(DB_ID, SUBSCRIPTIONS_COL, [
    Query.equal('student_id', studentId),
    Query.equal('academy_id', academyId),
    Query.notEqual('status', 'canceled'),
    Query.limit(1),
  ]);
  return res.documents?.[0] || null;
}

export default async function pagbankPortalTokenHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!getPortalJwtSecret()) {
    console.error('[pagbankPortalTokenHandler] portal JWT secret not configured');
    return res.status(503).json({ error: 'server_misconfigured' });
  }

  if (!STUDENTS_COL || !DB_ID) {
    return res.status(503).json({ error: 'server_misconfigured' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const parsed = parseJsonBody(req);
  if (parsed.error) {
    return res.status(400).json({ error: parsed.error });
  }

  const student_id = String(parsed.body?.student_id ?? '').trim();
  const plan_internal_key = String(parsed.body?.plan_internal_key ?? '').trim();

  const missing = [];
  if (!student_id) missing.push('student_id');
  if (!plan_internal_key) missing.push('plan_internal_key');
  if (missing.length) {
    return res.status(400).json({ error: 'missing_fields', fields: missing });
  }

  let studentDoc;
  try {
    studentDoc = await databases.getDocument(DB_ID, STUDENTS_COL, student_id);
  } catch {
    return res.status(404).json({ error: 'student_not_found' });
  }

  const docAcademyId = String(studentDoc.academyId || studentDoc.academy_id || '').trim();
  if (docAcademyId !== academyId) {
    return res.status(403).json({ error: 'student_not_in_academy' });
  }

  const planRes = await databases.listDocuments(DB_ID, PLANS_COL, [
    Query.equal('internal_key', plan_internal_key),
    Query.equal('academy_id', academyId),
    Query.equal('active', true),
    Query.limit(1),
  ]);
  const planDoc = planRes.documents?.[0] || null;
  if (!planDoc) {
    return res.status(404).json({ error: 'plan_not_found' });
  }

  const existingSub = await findActiveSubscription(student_id, academyId);
  if (existingSub) {
    return res.status(200).json({
      already_subscribed: true,
      subscription_id: existingSub.subscription_id,
      status: existingSub.status,
    });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    student_id,
    academy_id: academyId,
    plan_internal_key,
    student_name: String(studentDoc.name || '').trim(),
    student_email: String(studentDoc.email || '').trim(),
    student_tax_id: String(studentDoc.cpf || studentDoc.tax_id || '').replace(/\D/g, ''),
    student_birth_date: String(studentDoc.birthDate || studentDoc.birth_date || '').slice(0, 10),
    student_phone: String(studentDoc.phone || '').trim(),
    purpose: PORTAL_JWT_PURPOSE,
    iat: nowSec,
    exp: nowSec + TOKEN_TTL_HOURS * 3600,
  };

  const token = signPortalJwt(payload, getPortalJwtSecret());
  const appUrl = resolveAppUrl();
  const portalUrl = appUrl
    ? `${appUrl}/cartao/${encodeURIComponent(token)}`
    : `/cartao/${encodeURIComponent(token)}`;

  return res.status(200).json({
    ok: true,
    portal_url: portalUrl,
    expires_in_hours: TOKEN_TTL_HOURS,
    student_name: studentDoc.name || '',
    plan_name: planDoc.name || plan_internal_key,
  });
}
