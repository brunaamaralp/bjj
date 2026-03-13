import { Client, Databases, Permission, Role, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
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
    const ownerId = String(body.ownerId || '').trim();
    const queries = [Query.limit(500)];
    if (ownerId) queries.unshift(Query.equal('ownerId', [ownerId]));
    const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, queries);
    const updated = [];
    for (const doc of list.documents) {
      const owner = String(doc.ownerId || '').trim();
      if (!owner) continue;
      const perms = [
        Permission.read(Role.user(owner)),
        Permission.update(Role.user(owner)),
        Permission.delete(Role.user(owner)),
      ];
      await databases.updateDocument(DB_ID, ACADEMIES_COL, doc.$id, {}, perms);
      updated.push(doc.$id);
    }
    return res.status(200).json({ sucesso: true, count: updated.length, ids: updated });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
