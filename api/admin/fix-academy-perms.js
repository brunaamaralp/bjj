import { Client, Databases, Permission, Role, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
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
    const onlySchema = Boolean(body.onlySchema);
    if (onlySchema) {
      return res.status(200).json({ sucesso: true, schema });
    }

    const includeAcademies = typeof body.includeAcademies === 'boolean' ? body.includeAcademies : true;
    const includeLeads = typeof body.includeLeads === 'boolean' ? body.includeLeads : true;
    const includeConversations = typeof body.includeConversations === 'boolean' ? body.includeConversations : true;
    const includeSettings = typeof body.includeSettings === 'boolean' ? body.includeSettings : true;
    const maxDocs = Number.isFinite(Number(body.maxDocs)) ? Math.max(1, Math.min(20000, Number(body.maxDocs))) : 5000;

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
      if (!colId) return { ok: false, kind, erro: 'collection_id_ausente', processed: 0, updated: 0, skipped: 0, errors: 0 };
      let processed = 0;
      let updated = 0;
      let skipped = 0;
      let errors = 0;
      let cursor = '';

      while (processed < maxDocs) {
        const limit = Math.min(500, maxDocs - processed);
        const queries = [Query.limit(limit)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const list = await databases.listDocuments(DB_ID, colId, queries);
        const docs = Array.isArray(list?.documents) ? list.documents : [];
        if (docs.length === 0) break;

        for (const doc of docs) {
          processed += 1;
          cursor = String(doc?.$id || '').trim() || cursor;

          let academyId = '';
          if (kind === 'academies') {
            academyId = String(doc?.$id || '').trim();
          } else if (academyIdFieldHint === 'academyId') {
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

          const academy = kind === 'academies'
            ? { id: academyId, ownerId: String(doc?.ownerId || ''), teamId: String(doc?.teamId || '') }
            : await getAcademy(academyId);

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

        if (docs.length < limit) break;
      }

      return { ok: true, kind, processed, updated, skipped, errors };
    };
    const ownerId = String(body.ownerId || '').trim();
    const queries = [Query.limit(500)];
    if (ownerId) queries.unshift(Query.equal('ownerId', [ownerId]));
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);

    const results = {};
    if (includeAcademies) {
      const updatedAcademies = [];
      for (const doc of list.documents) {
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

    return res.status(200).json({ sucesso: true, schema, results });
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
}
