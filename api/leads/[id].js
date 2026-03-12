import { Client, Databases } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  return true;
}
function ensureJson(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    res.status(400).json({ sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    res.status(400).json({ sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;
  const id = req.query?.id || '';
  if (!id) return res.status(400).json({ sucesso: false, erro: 'ID ausente' });
  try {
    const doc = await databases.getDocument(DB_ID, LEADS_COL, id);
    const body = req.body || {};
    const updates = {};
    if (typeof body.status === 'string' && body.status.trim()) {
      updates.status = String(body.status).trim();
    }
    let newNotes = null;
    if (typeof body.nota === 'string' && body.nota.trim()) {
      let parsed = {};
      try {
        parsed = doc.notes ? JSON.parse(doc.notes) : {};
      } catch {
        parsed = {};
      }
      if (!parsed.history || !Array.isArray(parsed.history)) parsed.history = [];
      parsed.history.push({ type: 'note', text: String(body.nota), at: new Date().toISOString() });
      newNotes = JSON.stringify(parsed);
      updates.notes = newNotes;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ sucesso: false, erro: 'Nada para atualizar' });
    }
    await databases.updateDocument(DB_ID, LEADS_COL, id, updates);
    return res.status(200).json({ sucesso: true, id });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
  }
}
