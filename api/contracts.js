import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import {
  handleGetContracts,
  handleGetContractById,
  handleGetContractAutentiqueMeta,
  handlePostContract,
  handlePreviewContract,
  handlePatchContract,
  jsonResponse,
} from '../lib/contracts/contractHttp.js';
import {
  handleDeleteContractTemplate,
  handleGetContractTemplates,
  handlePatchContractTemplate,
  handlePostContractTemplate,
} from '../lib/contracts/contractTemplateHttp.js';
import {
  autentiqueGetStatusHandler,
  autentiqueSaveConfigHandler,
} from '../lib/server/autentiqueHandlers.js';

export const config = {
  api: {
    bodyParser: false,
  },
  maxDuration: 60,
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function responseToVercel(res, response) {
  const body = await response.text();
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  res.end(body);
}

async function incomingToFormData(req) {
  const raw = await readRawBody(req);
  const host = req.headers.host || 'localhost';
  const url = `https://${host}${req.url || '/api/contracts'}`;
  return new Request(url, {
    method: 'POST',
    headers: req.headers,
    body: raw,
  }).formData();
}

function contractIdFromRequest(req) {
  const route = String(req.query?.route || '').trim();
  if (route === 'templates') return '';
  const q = req.query?.id;
  if (Array.isArray(q)) return String(q[0] || '').trim();
  if (q) return String(q).trim();
  const url = String(req.url || '');
  if (/\/api\/contract-templates/.test(url)) return '';
  const m = url.match(/\/api\/contracts\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

function isTemplatesRoute(req) {
  const route = String(req.query?.route || '').trim();
  if (route === 'templates') return true;
  return /\/api\/contract-templates/.test(String(req.url || ''));
}

function templateIdFromRequest(req) {
  const q = req.query?.id;
  if (Array.isArray(q)) return String(q[0] || '').trim();
  if (q) return String(q).trim();
  const url = String(req.url || '');
  const m = url.match(/\/api\/contract-templates\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

async function readJsonBody(req) {
  const raw = await readRawBody(req);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return {};
  }
}

function sendContractsJsonError(res, err, label) {
  if (res.headersSent) return;
  console.error(label, err);
  const message = err instanceof Error ? err.message : String(err);
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: false, error: message }));
}

async function handleTemplatesVercel(req, res, auth) {
  const templateId = templateIdFromRequest(req);
  const host = req.headers.host || 'localhost';
  const url = new URL(req.url || '/api/contracts?route=templates', `https://${host}`);

  if (req.method === 'GET') {
    try {
      return await responseToVercel(res, await handleGetContractTemplates(auth, url.searchParams));
    } catch (err) {
      return sendContractsJsonError(res, err, '[api/contracts templates GET]');
    }
  }

  if (req.method === 'POST' && !templateId) {
    try {
      const body = await readJsonBody(req);
      return responseToVercel(res, await handlePostContractTemplate(body, auth));
    } catch (err) {
      console.error('[api/contracts templates POST]', err);
      const message = err instanceof Error ? err.message : String(err);
      return responseToVercel(res, jsonResponse({ ok: false, error: message }, 500));
    }
  }

  if (req.method === 'PATCH' && templateId) {
    const body = await readJsonBody(req);
    return responseToVercel(res, await handlePatchContractTemplate(templateId, body, auth));
  }

  if (req.method === 'DELETE' && templateId) {
    return responseToVercel(res, await handleDeleteContractTemplate(templateId, auth));
  }

  return responseToVercel(res, jsonResponse({ ok: false, error: 'method_not_allowed' }, 405));
}

async function resolveContractAuth(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return null;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;

  const ownerId = String(access.doc?.ownerId || '').trim();
  const userId = String(me.$id || '').trim();
  const isOwner = Boolean(ownerId && userId && ownerId === userId);

  return {
    academyId: access.academyId,
    userId,
    isOwner,
  };
}

export default async function handler(req, res) {
  try {
  const route = String(req.query?.route || '').trim();
  if (route === 'autentique_save_config') return autentiqueSaveConfigHandler(req, res);
  if (route === 'autentique_get_status') return autentiqueGetStatusHandler(req, res);

  const auth = await resolveContractAuth(req, res);
  if (!auth) return;

  if (isTemplatesRoute(req)) {
    return handleTemplatesVercel(req, res, auth);
  }

  const id = contractIdFromRequest(req);

  if (id && req.method === 'GET') {
    const url = new URL(req.url || '/api/contracts', `https://${req.headers.host || 'localhost'}`);
    return responseToVercel(res, await handleGetContractById(id, auth, url.searchParams));
  }

  if (id && req.method === 'PATCH') {
    const body = await readJsonBody(req);
    return responseToVercel(res, await handlePatchContract(id, body, auth));
  }

  if (!id && req.method === 'GET') {
    const url = new URL(req.url || '/api/contracts', `https://${req.headers.host || 'localhost'}`);
    if (url.searchParams.get('action') === 'autentique-meta') {
      return responseToVercel(res, await handleGetContractAutentiqueMeta(auth));
    }
    return responseToVercel(res, await handleGetContracts(url.searchParams, auth));
  }

  if (!id && req.method === 'POST') {
    try {
      const formData = await incomingToFormData(req);
      const action = String(req.query?.action || formData.get('action') || '').trim();
      if (action === 'preview') {
        return responseToVercel(res, await handlePreviewContract(formData, auth));
      }
      return responseToVercel(res, await handlePostContract(formData, auth));
    } catch (err) {
      console.error('[api/contracts POST]', err);
      const message = err instanceof Error ? err.message : String(err);
      return responseToVercel(res, jsonResponse({ ok: false, error: message }, 500));
    }
  }

  return responseToVercel(res, jsonResponse({ ok: false, error: 'method_not_allowed' }, 405));
  } catch (err) {
    sendContractsJsonError(res, err, '[api/contracts]');
  }
}
