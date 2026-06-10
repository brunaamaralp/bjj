/**
 * Matrícula pública via link compartilhável — sem sessão.
 * GET/POST /api/leads?route=public-enrollment&token=...
 * POST /api/leads?route=public-enrollment-config (autenticado)
 */
import { apiErro, logApiError } from './friendlyError.js';

import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import {
  readPublicEnrollment,
  mergePublicEnrollmentIntoSettings,
  buildPublicEnrollmentFormConfig,
  generateEnrollmentSalt,
} from '../../src/lib/publicEnrollmentSettings.js';
import {
  createPublicEnrollmentToken,
  verifyPublicEnrollmentToken,
} from '../../src/lib/publicEnrollmentToken.js';
import { enrollPublicStudent } from './publicEnrollmentEnroll.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function enrollmentSecret() {
  return String(
    process.env.ENROLLMENT_LINK_SECRET ||
      process.env.APPWRITE_API_KEY ||
      process.env.CRON_SECRET ||
      ''
  ).trim();
}

async function resolveAcademyFromToken(token) {
  const secret = enrollmentSecret();
  if (!secret) return { error: 'misconfigured', status: 503 };

  const parsed = await verifyPublicEnrollmentToken(token, secret);
  if (!parsed) return { error: 'invalid_token', status: 404 };

  if (!ACADEMIES_COL) return { error: 'misconfigured', status: 503 };

  let doc;
  try {
    doc = await databases.getDocument(DB_ID, ACADEMIES_COL, parsed.academyId);
  } catch {
    return { error: 'invalid_token', status: 404 };
  }

  const cfg = readPublicEnrollment(doc.settings);
  if (!cfg.enabled || !cfg.salt || cfg.salt !== parsed.salt) {
    return { error: 'link_disabled', status: 403 };
  }

  return { academy: doc, academyId: parsed.academyId, config: cfg };
}

async function handlePublicGet(req, res) {
  const token = String(req.query.token || '').trim();
  if (!token) return json(res, 400, { sucesso: false, erro: 'token_required' });

  const resolved = await resolveAcademyFromToken(token);
  if (resolved.error) {
    return json(res, resolved.status, { sucesso: false, erro: resolved.error });
  }

  const form = buildPublicEnrollmentFormConfig(resolved.academy);
  return json(res, 200, { sucesso: true, ...form });
}

async function handlePublicPost(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { sucesso: false, erro: 'method_not_allowed' });
  }

  const token = String(req.query.token || req.body?.token || '').trim();
  if (!token) return json(res, 400, { sucesso: false, erro: 'token_required' });

  if (!STUDENTS_COL) return json(res, 503, { sucesso: false, erro: 'misconfigured' });

  const resolved = await resolveAcademyFromToken(token);
  if (resolved.error) {
    return json(res, resolved.status, { sucesso: false, erro: resolved.error });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const formConfig = buildPublicEnrollmentFormConfig(resolved.academy);

  try {
    const result = await enrollPublicStudent(
      databases,
      resolved.academy,
      resolved.academyId,
      body,
      formConfig.customQuestions || []
    );

    return json(res, 200, {
      sucesso: true,
      id: result.studentId,
      convertedFromLead: result.convertedFromLead,
      message: result.convertedFromLead
        ? 'Matrícula concluída! Seus dados foram vinculados ao cadastro da academia.'
        : 'Matrícula realizada! A academia entrará em contato para os próximos passos.',
    });
  } catch (e) {
    const code = e?.code || e?.message || 'server_error';
    if (code === 'name_required') return json(res, 400, { sucesso: false, erro: code });
    if (code === 'phone_invalid') return json(res, 400, { sucesso: false, erro: code });
    if (code === 'plan_required') {
      return json(res, 400, {
        sucesso: false,
        erro: code,
        message: 'Selecione o plano para concluir a matrícula.',
      });
    }
    if (code === 'plan_invalid') return json(res, 400, { sucesso: false, erro: code });
    if (code === 'phone_duplicate' || code === 'student_inactive') {
      return json(res, 409, {
        sucesso: false,
        erro: code,
        message: 'Este telefone já está cadastrado na academia.',
      });
    }
    console.error('[public-enrollment] enroll', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'server_error' });
  }
}

async function handleConfigPost(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { sucesso: false, erro: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const secret = enrollmentSecret();
  if (!secret) return json(res, 503, { sucesso: false, erro: 'misconfigured' });

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const enabled = body.enabled === true;
  const regenerate = body.regenerate === true;

  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, access.academyId);
    const prev = readPublicEnrollment(doc.settings);
    let salt = prev.salt;
    if (!salt || regenerate) salt = generateEnrollmentSalt();

    const merged = mergePublicEnrollmentIntoSettings(doc.settings, {
      enabled: enabled && Boolean(salt),
      salt: enabled ? salt : prev.salt || salt,
    });

    await databases.updateDocument(DB_ID, ACADEMIES_COL, access.academyId, {
      settings: JSON.stringify(merged),
    });

    const cfg = readPublicEnrollment(JSON.stringify(merged));
    let token = '';
    if (cfg.enabled && cfg.salt) {
      token = await createPublicEnrollmentToken(access.academyId, cfg.salt, secret);
    }

    return json(res, 200, {
      sucesso: true,
      enabled: cfg.enabled,
      token,
      path: token ? `/inscricao/${encodeURIComponent(token)}` : '',
    });
  } catch (e) {
    console.error('[public-enrollment-config]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

export default async function publicEnrollmentHandler(req, res) {
  if (req.query.route === 'public-enrollment-config') {
    return handleConfigPost(req, res);
  }

  if (req.method === 'GET') return handlePublicGet(req, res);
  if (req.method === 'POST') return handlePublicPost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { sucesso: false, erro: 'method_not_allowed' });
}
