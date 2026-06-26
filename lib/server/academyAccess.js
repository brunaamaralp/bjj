import { Client, Databases, Query, Account, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
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

/** TTL alinhado ao cache do cliente (`getAcademyDocument.js`). */
const ACADEMY_DOC_TTL_MS = 60_000;
const ACCESS_RESULT_TTL_MS = 60_000;
const MEMBERSHIP_TTL_MS = 60_000;

/** @type {Map<string, { doc?: object, fetchedAt?: number, promise?: Promise<object> }>} */
const academyDocCache = new Map();
/** @type {Map<string, { access?: { academyId: string, doc: object }, fetchedAt?: number, promise?: Promise<{ academyId: string, doc: object } | null> }>} */
const accessResultCache = new Map();
/** @type {Map<string, { membership?: object | null, fetchedAt?: number, promise?: Promise<object | null> }>} */
const teamMembershipCache = new Map();

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
/** Cliente admin (API key) para handlers server-side que precisam ler/atualizar documentos. */
export const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

export { DB_ID, ACADEMIES_COL };

function isRateLimitError(e) {
  const msg = String(e?.message || '').toLowerCase();
  const code = Number(e?.code ?? e?.status ?? 0);
  return msg.includes('too many requests') || code === 429;
}

function accessCacheKey(academyId, userId) {
  return `${academyId}:${userId}`;
}

/**
 * Limpa caches após alteração de academia/time (ex.: settings, convite de membro).
 * @param {string} [academyId]
 * @param {{ userId?: string; teamId?: string }} [opts]
 */
export function invalidateAcademyAccessCache(academyId, opts = {}) {
  const userId = String(opts?.userId || '').trim();
  const teamId = String(opts?.teamId || '').trim();
  if (userId && teamId) {
    teamMembershipCache.delete(`${teamId}:${userId}`);
  }

  if (academyId) {
    const id = String(academyId).trim();
    academyDocCache.delete(id);
    for (const key of accessResultCache.keys()) {
      if (key.startsWith(`${id}:`)) accessResultCache.delete(key);
    }
    return;
  }
  academyDocCache.clear();
  accessResultCache.clear();
  teamMembershipCache.clear();
}

async function fetchAcademyDocument(academyId) {
  const id = String(academyId || '').trim();
  const now = Date.now();
  const entry = academyDocCache.get(id);

  if (entry?.doc && entry.fetchedAt != null && now - entry.fetchedAt < ACADEMY_DOC_TTL_MS) {
    return entry.doc;
  }
  if (entry?.promise) return entry.promise;

  const promise = databases
    .getDocument(DB_ID, ACADEMIES_COL, id)
    .then((doc) => {
      academyDocCache.set(id, { doc, fetchedAt: Date.now() });
      return doc;
    })
    .catch((err) => {
      const cur = academyDocCache.get(id);
      if (cur?.promise === promise) academyDocCache.delete(id);
      throw err;
    });

  academyDocCache.set(id, { ...(entry || {}), promise });
  return promise;
}

async function fetchTeamMembership(teamId, userId) {
  const key = `${teamId}:${userId}`;
  const now = Date.now();
  const entry = teamMembershipCache.get(key);

  if (entry && 'membership' in entry && entry.fetchedAt != null && now - entry.fetchedAt < MEMBERSHIP_TTL_MS) {
    return entry.membership;
  }
  if (entry?.promise) return entry.promise;

  const promise = teams
    .listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)])
    .then((memberships) => {
      const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
      const membership = list[0] || null;
      teamMembershipCache.set(key, { membership, fetchedAt: Date.now() });
      return membership;
    })
    .catch((err) => {
      const cur = teamMembershipCache.get(key);
      if (cur?.promise === promise) teamMembershipCache.delete(key);
      throw err;
    });

  teamMembershipCache.set(key, { ...(entry || {}), promise });
  return promise;
}

export async function resolveAcademyAccess(academyId, me) {
  const userId = String(me?.$id || '').trim();
  const cacheKey = accessCacheKey(academyId, userId);
  const now = Date.now();
  const cached = accessResultCache.get(cacheKey);

  if (cached?.access && cached.fetchedAt != null && now - cached.fetchedAt < ACCESS_RESULT_TTL_MS) {
    return cached.access;
  }
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const doc = await fetchAcademyDocument(academyId);
    if (!doc || String(doc.status || '').trim().toLowerCase() === 'inactive') {
      return null;
    }

    const ownerId = String(doc?.ownerId || '').trim();
    if (ownerId && userId && ownerId === userId) {
      return { academyId, doc };
    }

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const membership = await fetchTeamMembership(teamId, userId);
        if (membership) return { academyId, doc };
      } catch {
        void 0;
      }
    }

    return null;
  })()
    .then((access) => {
      if (access) {
        accessResultCache.set(cacheKey, { access, fetchedAt: Date.now() });
      } else {
        accessResultCache.delete(cacheKey);
      }
      return access;
    })
    .catch((err) => {
      const cur = accessResultCache.get(cacheKey);
      if (cur?.promise === promise) accessResultCache.delete(cacheKey);
      throw err;
    });

  accessResultCache.set(cacheKey, { ...(cached || {}), promise });
  return promise;
}

export function resolveAcademyHeader(req) {
  return String(req.headers['x-academy-id'] || '').trim();
}

/** @returns {Promise<import('node-appwrite').Models.User<import('node-appwrite').Models.Preferences> | null>} */
export async function ensureAuth(req, res) {
  const auth = String(req.headers.authorization || '');
  if (!auth.toLowerCase().startsWith('bearer ')) {
    res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
    return null;
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    return await account.get();
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

/**
 * Dono da academia ou membro do time (recepcionista) com acesso à academia do header x-academy-id.
 * @returns {Promise<{ academyId: string, doc: import('node-appwrite').Models.Document } | null>}
 */
export async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyHeader(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  if (!DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return null;
  }
  try {
    const access = await resolveAcademyAccess(academyId, me);
    if (!access) {
      res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
      return null;
    }
    return access;
  } catch (e) {
    console.error('[ensureAcademyAccess] Erro inesperado:', e);
    const msg = e?.message || '';
    if (msg.includes('document_not_found') || msg.includes('not found')) {
      res.status(403).json({ sucesso: false, erro: `Academia ${academyId} não localizada` });
    } else if (isRateLimitError(e)) {
      res.status(429).json({
        sucesso: false,
        erro: 'Muitas requisições ao Appwrite. Aguarde alguns segundos e recarregue a página.',
      });
    } else {
      res.status(500).json({ sucesso: false, erro: `Erro ao validar academia: ${msg || 'Erro desconhecido'}` });
    }
    return null;
  }
}

/**
 * Titular da academia ou membro do time com papel admin/owner (edição de templates, etc.).
 * @returns {Promise<{ academyId: string, doc: import('node-appwrite').Models.Document } | null>}
 */
export async function ensureAcademyOwnerOrAdmin(req, res, me) {
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;
  const { doc } = access;
  const ownerId = String(doc?.ownerId || '').trim();
  const userId = String(me?.$id || '').trim();
  if (ownerId && userId && ownerId === userId) return access;

  const teamId = String(doc?.teamId || '').trim();
  if (teamId && userId) {
    try {
      const m = await fetchTeamMembership(teamId, userId);
      const roles = Array.isArray(m?.roles) ? m.roles : [];
      if (roles.includes('admin') || roles.includes('owner')) return access;
    } catch (e) {
      if (isRateLimitError(e)) {
        res.status(429).json({
          sucesso: false,
          erro: 'Muitas requisições ao Appwrite. Aguarde alguns segundos e recarregue a página.',
        });
        return null;
      }
    }
  }

  res.status(403).json({ sucesso: false, erro: 'Apenas titular ou administrador pode editar templates' });
  return null;
}

/** Titular ou membro do time com papel admin/owner (sem escrever resposta HTTP). */
export async function isAcademyOwnerOrAdminUser(doc, me) {
  const ownerId = String(doc?.ownerId || '').trim();
  const userId = String(me?.$id || '').trim();
  if (ownerId && userId && ownerId === userId) return true;

  const teamId = String(doc?.teamId || '').trim();
  if (teamId && userId) {
    try {
      const m = await fetchTeamMembership(teamId, userId);
      const roles = Array.isArray(m?.roles) ? m.roles : [];
      if (roles.includes('admin') || roles.includes('owner')) return true;
    } catch {
      void 0;
    }
  }
  return false;
}
