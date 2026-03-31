import { Client, Databases, ID, Permission, Role, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const SETTINGS_COL = process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || '';
const TOKEN = process.env.MIGRATION_TOKEN || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!TOKEN) {
    res.status(500).json({ sucesso: false, erro: 'MIGRATION_TOKEN ausente' });
    return false;
  }
  return true;
}

async function ensureCustomLeadQuestionsAttribute() {
  const headers = {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'Content-Type': 'application/json',
  };

  try {
    const listRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${ACADEMIES_COL}/attributes`, { headers });
    if (listRes.ok) {
      const data = await listRes.json().catch(() => ({}));
      const attrs = Array.isArray(data?.attributes) ? data.attributes : [];
      if (attrs.some((a) => a && a.key === 'customLeadQuestions')) {
        return { ok: true, created: false, exists: true };
      }
    }
  } catch {
    void 0;
  }

  const body = {
    key: 'customLeadQuestions',
    size: 10000,
    required: false,
    default: '[]',
    array: false,
    encrypt: false,
  };

  const createRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${ACADEMIES_COL}/attributes/string`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (createRes.ok) {
    return { ok: true, created: true, exists: true };
  }

  const err = await createRes.json().catch(() => ({}));
  const msg = String(err?.message || '');
  const typ = String(err?.type || '');
  if (/already/i.test(msg) || /already/i.test(typ)) {
    return { ok: true, created: false, exists: true };
  }
  throw new Error(msg || `Falha ao criar atributo customLeadQuestions (HTTP ${createRes.status})`);
}

async function ensureSettingsSchema() {
  if (!SETTINGS_COL) return { ok: false, skipped: true, reason: 'SETTINGS_COL_ausente' };
  const headers = {
    'X-Appwrite-Project': PROJECT_ID,
    'X-Appwrite-Key': API_KEY,
    'Content-Type': 'application/json',
  };

  const ensureStringAttr = async ({ key, size, required }) => {
    try {
      const listRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${SETTINGS_COL}/attributes`, { headers });
      if (listRes.ok) {
        const data = await listRes.json().catch(() => ({}));
        const attrs = Array.isArray(data?.attributes) ? data.attributes : [];
        if (attrs.some((a) => a && a.key === key)) return { ok: true, key, created: false };
      }
    } catch {
      void 0;
    }

    const createRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${SETTINGS_COL}/attributes/string`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, size, required: Boolean(required), default: '', array: false, encrypt: false }),
    });
    if (createRes.ok) return { ok: true, key, created: true };

    const err = await createRes.json().catch(() => ({}));
    const msg = String(err?.message || '');
    const typ = String(err?.type || '');
    if (/already/i.test(msg) || /already/i.test(typ)) return { ok: true, key, created: false };
    return { ok: false, key, erro: msg || `Falha ao criar atributo ${key} (HTTP ${createRes.status})` };
  };

  const ensureIndex = async ({ key, attributes }) => {
    try {
      const listRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${SETTINGS_COL}/indexes`, { headers });
      if (listRes.ok) {
        const data = await listRes.json().catch(() => ({}));
        const idx = Array.isArray(data?.indexes) ? data.indexes : [];
        if (idx.some((i) => i && i.key === key)) return { ok: true, key, created: false };
      }
    } catch {
      void 0;
    }

    const createRes = await fetch(`${ENDPOINT}/databases/${DB_ID}/collections/${SETTINGS_COL}/indexes`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ key, type: 'key', attributes, orders: ['ASC'] }),
    });
    if (createRes.ok) return { ok: true, key, created: true };

    const err = await createRes.json().catch(() => ({}));
    const msg = String(err?.message || '');
    const typ = String(err?.type || '');
    if (/already/i.test(msg) || /already/i.test(typ)) return { ok: true, key, created: false };
    return { ok: false, key, erro: msg || `Falha ao criar index ${key} (HTTP ${createRes.status})` };
  };

  const out = {
    ok: true,
    attributes: [],
    indexes: [],
  };

  out.attributes.push(await ensureStringAttr({ key: 'academy_id', size: 128, required: true }));
  out.attributes.push(await ensureStringAttr({ key: 'prompt_intro', size: 10000, required: false }));
  out.attributes.push(await ensureStringAttr({ key: 'prompt_body', size: 10000, required: false }));
  out.attributes.push(await ensureStringAttr({ key: 'prompt_suffix', size: 10000, required: false }));
  out.indexes.push(await ensureIndex({ key: 'academy_id_idx', attributes: ['academy_id'] }));

  out.ok = out.attributes.every((a) => a && a.ok) && out.indexes.every((i) => i && i.ok);
  return out;
}

function getAcademyIdFromDoc(doc) {
  if (!doc || typeof doc !== 'object') return '';
  const v = doc.academy_id || doc.academyId || doc.academy || doc.academyID || '';
  return String(v || '').trim();
}

function permissionsForAcademy({ ownerId, teamId }) {
  const owner = String(ownerId || '').trim();
  const team = String(teamId || '').trim();
  const perms = [];
  if (owner) perms.push(Permission.read(Role.user(owner)), Permission.update(Role.user(owner)), Permission.delete(Role.user(owner)));
  if (team) perms.push(Permission.read(Role.team(team)), Permission.update(Role.team(team)), Permission.delete(Role.team(team)));
  return perms;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }
  if (!ensureConfigOk(res)) return;
  const hdr = String(req.headers['x-migration-token'] || '');
  if (!hdr || hdr !== TOKEN) {
    return res.status(401).json({ sucesso: false, erro: 'Não autorizado' });
  }
  try {
    const body = req.body || {};
    const schema = await ensureCustomLeadQuestionsAttribute();
    if (Boolean(body.onlySchema)) {
      return res.status(200).json({ sucesso: true, schema });
    }

    const migratePromptDocs = typeof body.migratePromptDocs === 'boolean' ? body.migratePromptDocs : true;
    const deleteOldPromptDocs = Boolean(body.deleteOldPromptDocs);

    const includeAcademies = typeof body.includeAcademies === 'boolean' ? body.includeAcademies : true;
    const includeLeads = typeof body.includeLeads === 'boolean' ? body.includeLeads : true;
    const includeConversations = typeof body.includeConversations === 'boolean' ? body.includeConversations : true;
    const includeSettings = typeof body.includeSettings === 'boolean' ? body.includeSettings : true;

    const limitPerCollection = Number.isFinite(Number(body.limitPerCollection))
      ? Math.max(1, Math.min(500, Number(body.limitPerCollection)))
      : 200;
    const maxDocs = Number.isFinite(Number(body.maxDocs)) ? Math.max(1, Math.min(20000, Number(body.maxDocs))) : 5000;
    const cursors = body && typeof body.cursors === 'object' && body.cursors ? body.cursors : {};

    const settingsSchema = migratePromptDocs ? await ensureSettingsSchema() : { ok: true, skipped: true };

    const academyCache = new Map();
    const getAcademy = async (academyId) => {
      const id = String(academyId || '').trim();
      if (!id) return null;
      if (academyCache.has(id)) return academyCache.get(id);
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id).catch(() => null);
      const packed = doc && doc.$id ? { id: String(doc.$id), ownerId: String(doc.ownerId || ''), teamId: String(doc.teamId || '') } : null;
      academyCache.set(id, packed);
      return packed;
    };

    const migrateCollection = async ({ colId, kind, academyIdFieldHint }) => {
      if (!colId) return { ok: false, kind, erro: 'collection_id_ausente', processed: 0, updated: 0, skipped: 0, errors: 0, done: true, nextCursor: '' };

      let processed = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      let cursor = String(cursors?.[kind] || '').trim();
      let exhausted = false;

      const hardLimit = Math.min(maxDocs, limitPerCollection);
      while (processed < hardLimit) {
        const limit = Math.min(100, hardLimit - processed);
        const queries = [Query.orderAsc('$id'), Query.limit(limit)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const list = await databases.listDocuments(DB_ID, colId, queries);
        const docs = Array.isArray(list?.documents) ? list.documents : [];
        if (docs.length === 0) {
          exhausted = true;
          break;
        }

        for (const doc of docs) {
          processed += 1;
          cursor = String(doc?.$id || '').trim() || cursor;

          let academyId = '';
          if (academyIdFieldHint === 'academyId') {
            academyId = String(doc?.academyId || '').trim() || getAcademyIdFromDoc(doc);
          } else if (academyIdFieldHint === 'academy_id') {
            academyId = String(doc?.academy_id || '').trim() || getAcademyIdFromDoc(doc);
          } else {
            academyId = getAcademyIdFromDoc(doc);
          }

          if (!academyId) {
            skipped += 1;
            continue;
          }

          const academy = await getAcademy(academyId);
          if (!academy || !academy.ownerId) {
            skipped += 1;
            continue;
          }

          const perms = permissionsForAcademy(academy);
          if (perms.length === 0) {
            skipped += 1;
            continue;
          }

          try {
            await databases.updateDocument(DB_ID, colId, String(doc.$id), {}, perms);
            updated += 1;
          } catch {
            errors += 1;
          }
        }

        if (docs.length < limit) {
          exhausted = true;
          break;
        }
      }

      return { ok: true, kind, processed, updated, skipped, errors, done: exhausted, nextCursor: cursor };
    };

    const migratePromptDocsFromConversations = async () => {
      if (!migratePromptDocs) return { ok: true, skipped: true, processed: 0, created: 0, updated: 0, deleted: 0, skippedDocs: 0, errors: 0, done: true, nextCursor: '' };
      if (!SETTINGS_COL) return { ok: false, erro: 'collection_id_ausente', processed: 0, created: 0, updated: 0, deleted: 0, skippedDocs: 0, errors: 0, done: true, nextCursor: '' };
      if (!CONVERSATIONS_COL) return { ok: false, erro: 'CONVERSATIONS_COL_ausente', processed: 0, created: 0, updated: 0, deleted: 0, skippedDocs: 0, errors: 0, done: true, nextCursor: '' };

      let processed = 0;
      let created = 0;
      let updated = 0;
      let deleted = 0;
      let skippedDocs = 0;
      let errors = 0;
      let cursor = String(cursors?.promptDocs || '').trim();
      let exhausted = false;

      const hardLimit = Math.min(maxDocs, limitPerCollection);
      while (processed < hardLimit) {
        const limit = Math.min(100, hardLimit - processed);
        const queries = [Query.orderAsc('$id'), Query.limit(limit), Query.equal('phone_number', ['__settings__'])];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
        const docs = Array.isArray(list?.documents) ? list.documents : [];
        if (docs.length === 0) {
          exhausted = true;
          break;
        }

        for (const doc of docs) {
          processed += 1;
          cursor = String(doc?.$id || '').trim() || cursor;

          const academyId = String(doc?.academy_id || '').trim();
          if (!academyId) {
            skippedDocs += 1;
            continue;
          }

          const academy = await getAcademy(academyId);
          if (!academy || !academy.ownerId) {
            skippedDocs += 1;
            continue;
          }

          const perms = permissionsForAcademy(academy);
          if (perms.length === 0) {
            skippedDocs += 1;
            continue;
          }

          const data = {
            academy_id: academyId,
            prompt_intro: String(doc?.prompt_intro || ''),
            prompt_body: String(doc?.prompt_body || ''),
            prompt_suffix: String(doc?.prompt_suffix || ''),
          };

          try {
            const exists = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [academyId]), Query.limit(1)]);
            const existing = exists?.documents && exists.documents[0] ? exists.documents[0] : null;
            if (existing) {
              await databases.updateDocument(DB_ID, SETTINGS_COL, existing.$id, data);
              updated += 1;
            } else {
              await databases.createDocument(DB_ID, SETTINGS_COL, ID.unique(), data, perms);
              created += 1;
            }
            if (deleteOldPromptDocs) {
              try {
                await databases.deleteDocument(DB_ID, CONVERSATIONS_COL, String(doc.$id));
                deleted += 1;
              } catch {
                void 0;
              }
            }
          } catch {
            errors += 1;
          }
        }

        if (docs.length < limit) {
          exhausted = true;
          break;
        }
      }

      return { ok: true, processed, created, updated, deleted, skippedDocs, errors, done: exhausted, nextCursor: cursor };
    };

    const results = {};
    if (includeAcademies) {
      const ownerId = String(body.ownerId || '').trim();
      const queries = [Query.orderAsc('$id'), Query.limit(500)];
      if (ownerId) queries.unshift(Query.equal('ownerId', [ownerId]));
      const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);

      const updatedAcademies = [];
      const docs = Array.isArray(list?.documents) ? list.documents : [];
      for (const doc of docs) {
        const owner = String(doc.ownerId || '').trim();
        if (!owner) continue;
        const teamId = String(doc.teamId || '').trim();
        const perms = permissionsForAcademy({ ownerId: owner, teamId });
        await databases.updateDocument(DB_ID, ACADEMIES_COL, doc.$id, {}, perms);
        updatedAcademies.push(doc.$id);
      }
      results.academies = { ok: true, updated: updatedAcademies.length, ids: updatedAcademies.slice(0, 200) };
    }

    if (includeLeads) results.leads = await migrateCollection({ colId: LEADS_COL, kind: 'leads', academyIdFieldHint: 'academyId' });
    if (includeConversations)
      results.conversations = await migrateCollection({ colId: CONVERSATIONS_COL, kind: 'conversations', academyIdFieldHint: 'academy_id' });
    if (includeSettings) results.settings = await migrateCollection({ colId: SETTINGS_COL, kind: 'settings', academyIdFieldHint: 'academy_id' });
    if (migratePromptDocs) results.promptDocs = await migratePromptDocsFromConversations();

    const nextCursors = {};
    for (const k of Object.keys(results)) {
      const r = results[k];
      if (r && r.nextCursor) nextCursors[k] = r.nextCursor;
    }

    if (migratePromptDocs && settingsSchema) results.settingsSchema = settingsSchema;
    return res.status(200).json({ sucesso: true, schema, results, nextCursors });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}

