/**
 * Agendamento público de experimental — sem sessão.
 * GET/POST /api/leads?route=public-experimental&token=...
 * POST /api/leads?route=public-experimental-config (autenticado)
 */
import { apiErro } from './friendlyError.js';
import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, DB_ID } from './academyAccess.js';
import {
  readPublicExperimental,
  mergePublicExperimentalIntoSettings,
  buildPublicExperimentalFormConfig,
  generateExperimentalSalt,
} from '../../src/lib/publicExperimentalSettings.js';
import {
  createPublicExperimentalToken,
  verifyPublicExperimentalToken,
} from '../../src/lib/publicExperimentalToken.js';
import { inferProfileTypeFromBirthDate } from '../../src/lib/publicExperimentalAudience.js';
import {
  bookPublicExperimental,
  listPublicExperimentalSlots,
} from './publicExperimentalBook.js';

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

  const parsed = await verifyPublicExperimentalToken(token, secret);
  if (!parsed) return { error: 'invalid_token', status: 404 };

  if (!ACADEMIES_COL) return { error: 'misconfigured', status: 503 };

  let doc;
  try {
    doc = await databases.getDocument(DB_ID, ACADEMIES_COL, parsed.academyId);
  } catch {
    return { error: 'invalid_token', status: 404 };
  }

  const cfg = readPublicExperimental(doc.settings);
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

  const form = buildPublicExperimentalFormConfig(resolved.academy);
  const birthDate = String(req.query.birth_date || req.query.birthDate || '').trim().slice(0, 10);
  const profileTypeQuery = String(req.query.profile_type || req.query.profileType || '').trim();
  const profileType =
    profileTypeQuery ||
    (birthDate ? inferProfileTypeFromBirthDate(birthDate) : '') ||
    'Adulto';

  const slots = await listPublicExperimentalSlots(databases, resolved.academyId, {
    profileType,
    audienceRules: form.audienceRules,
    academySettings: resolved.academy.settings,
  });

  return json(res, 200, {
    sucesso: true,
    ...form,
    profileType,
    slots,
    requireSlot: slots.length > 0,
  });
}

async function handlePublicPost(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return json(res, 405, { sucesso: false, erro: 'method_not_allowed' });
  }

  const token = String(req.query.token || req.body?.token || '').trim();
  if (!token) return json(res, 400, { sucesso: false, erro: 'token_required' });

  const resolved = await resolveAcademyFromToken(token);
  if (resolved.error) {
    return json(res, resolved.status, { sucesso: false, erro: resolved.error });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const formConfig = buildPublicExperimentalFormConfig(resolved.academy);

  const birthDate = String(body.birthDate || body.birth_date || '').trim().slice(0, 10);
  const profileType =
    inferProfileTypeFromBirthDate(birthDate) ||
    String(body.profile_type || '').trim() ||
    'Adulto';
  const availableSlots = await listPublicExperimentalSlots(databases, resolved.academyId, {
    profileType,
    audienceRules: formConfig.audienceRules,
    academySettings: resolved.academy.settings,
  });
  const slotId = String(body.slot_id || '').trim();
  if (availableSlots.length > 0 && !slotId) {
    return json(res, 400, {
      sucesso: false,
      erro: 'slot_required',
      message: 'Escolha um horário.',
    });
  }

  try {
    const result = await bookPublicExperimental(
      databases,
      resolved.academy,
      resolved.academyId,
      body,
      formConfig
    );

    return json(res, 200, {
      sucesso: true,
      lead_id: result.leadId,
      rescheduled: result.rescheduled,
      scheduledDate: result.scheduledDate,
      scheduledTime: result.scheduledTime,
      profileType: result.profileType,
      message: result.rescheduled
        ? 'Horário atualizado! A academia confirmará sua experimental em breve.'
        : 'Aula experimental agendada! A academia entrará em contato para confirmar.',
    });
  } catch (e) {
    const code = e?.code || e?.message || 'server_error';
    if (code === 'name_required') return json(res, 400, { sucesso: false, erro: code });
    if (code === 'phone_invalid') return json(res, 400, { sucesso: false, erro: code });
    if (code === 'birth_date_required' || code === 'birth_date_invalid' || code === 'parent_required') {
      return json(res, 400, { sucesso: false, erro: code, message: e?.message });
    }
    if (code === 'slot_full') {
      return json(res, 409, {
        sucesso: false,
        erro: code,
        message: 'Este horário está lotado. Escolha outro.',
        capacity: e?.capacity,
      });
    }
    if (code === 'slot_unavailable' || code === 'slot_forbidden') {
      return json(res, 409, { sucesso: false, erro: code, message: 'Horário indisponível.' });
    }
    if (code === 'student_already_exists') {
      return json(res, 409, {
        sucesso: false,
        erro: code,
        message: 'Este telefone já pertence a um aluno. Fale com a recepção.',
      });
    }
    if (code === 'lead_converted') {
      return json(res, 409, {
        sucesso: false,
        erro: code,
        message: 'Você já está matriculado. Entre em contato com a academia.',
      });
    }
    console.error('[public-experimental] book', e?.message || e);
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
    const prev = readPublicExperimental(doc.settings);
    let salt = prev.salt;
    if (!salt || regenerate) salt = generateExperimentalSalt();

    const merged = mergePublicExperimentalIntoSettings(doc.settings, {
      enabled: enabled && Boolean(salt),
      salt: enabled ? salt : prev.salt || salt,
    });

    await databases.updateDocument(DB_ID, ACADEMIES_COL, access.academyId, {
      settings: JSON.stringify(merged),
    });

    const cfg = readPublicExperimental(JSON.stringify(merged));
    let token = '';
    if (cfg.enabled && cfg.salt) {
      token = await createPublicExperimentalToken(access.academyId, cfg.salt, secret);
    }

    return json(res, 200, {
      sucesso: true,
      enabled: cfg.enabled,
      token,
      path: token ? `/experimental/${encodeURIComponent(token)}` : '',
    });
  } catch (e) {
    console.error('[public-experimental-config]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

export default async function publicExperimentalHandler(req, res) {
  if (req.query.route === 'public-experimental-config') {
    return handleConfigPost(req, res);
  }

  if (req.method === 'GET') return handlePublicGet(req, res);
  if (req.method === 'POST') return handlePublicPost(req, res);

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { sucesso: false, erro: 'method_not_allowed' });
}
