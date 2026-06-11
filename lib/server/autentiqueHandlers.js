import { apiErro } from './friendlyError.js';
import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin, invalidateAcademyAccessCache } from './academyAccess.js';
import { encryptAutentiqueToken, decryptAutentiqueToken } from './autentiqueCrypto.js';
import { mergeAutentiqueIntoSettings, readAutentiqueConfig } from '../autentiqueSettings.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function loadAcademy(academyId) {
  return databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
}

async function readRequestJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return {};
  }
}

function resolveAccountEmail(academyDoc, cfg) {
  const direct = String(academyDoc?.autentique_account_email || '').trim();
  if (direct) return direct;
  return String(cfg?.account_email || '').trim();
}

export function maskAutentiqueToken(plain) {
  const token = String(plain || '').trim();
  if (!token) return '';
  return `${token.slice(0, 6)}••••••`;
}

/** Lê token em texto plano a partir do doc da academia (settings criptografado ou legado). */
export function configWithPlainToken(academyDoc) {
  const cfg = readAutentiqueConfig(academyDoc?.settings);
  let token = '';
  let configured = false;

  if (cfg.token_encrypted) {
    try {
      token = decryptAutentiqueToken(cfg.token_encrypted).trim();
      configured = Boolean(token);
    } catch {
      token = '';
      configured = false;
    }
  }

  if (!configured) {
    const legacyToken = String(academyDoc?.autentique_token || '').trim();
    if (legacyToken) {
      token = legacyToken;
      configured = true;
    }
  }

  return {
    enabled: cfg.enabled === true,
    token_encrypted: cfg.token_encrypted,
    account_email: resolveAccountEmail(academyDoc, cfg),
    token,
    configured,
  };
}

export async function getConfigForAcademy(academyId) {
  const academy = await loadAcademy(academyId);
  const config = configWithPlainToken(academy);
  if (!config.configured) {
    const err = new Error('Integração Autentique não configurada');
    err.code = 'not_configured';
    throw err;
  }
  return { academy, config };
}

export async function autentiqueSaveConfigHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;
  const { academyId } = access;

  try {
    const body = await readRequestJsonBody(req);
    const academy = await loadAcademy(academyId);
    const prev = readAutentiqueConfig(academy.settings);

    let tokenEncrypted = prev.token_encrypted;
    const newToken = String(body.token || '').trim();
    if (newToken) {
      tokenEncrypted = encryptAutentiqueToken(newToken);
    }

    const merged = mergeAutentiqueIntoSettings(academy.settings, {
      enabled: body.enabled !== undefined ? body.enabled === true : prev.enabled,
      token_encrypted: tokenEncrypted,
      account_email:
        body.account_email !== undefined
          ? String(body.account_email || '').trim()
          : prev.account_email,
    });

    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      settings: JSON.stringify(merged),
    });
    invalidateAcademyAccessCache(academyId);

    const configured = configWithPlainToken({ ...academy, settings: JSON.stringify(merged) }).configured;

    return json(res, 200, { ok: true, configured });
  } catch (e) {
    return json(res, 500, { ok: false, error: apiErro(e, 'save') });
  }
}

export async function autentiqueGetStatusHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: 'method_not_allowed' });

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { doc } = access;

  try {
    const cfg = readAutentiqueConfig(doc.settings);
    const plain = configWithPlainToken(doc);
    const accountEmail = resolveAccountEmail(doc, cfg);

    return json(res, 200, {
      configured: plain.configured,
      account_email: accountEmail,
      token_masked: plain.configured ? maskAutentiqueToken(plain.token) : '',
    });
  } catch (e) {
    return json(res, 500, { ok: false, error: apiErro(e, 'load') });
  }
}
