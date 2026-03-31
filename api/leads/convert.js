import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const teams = new Teams(client);

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

async function ensureAuth(req, res) {
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
    const me = await account.get();
    return me;
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function resolveAcademyId(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  return String(DEFAULT_ACADEMY_ID || '').trim();
}

async function ensureAcademyAccess(req, res, me) {
  const academyId = resolveAcademyId(req);
  if (!academyId) {
    res.status(400).json({ sucesso: false, erro: 'x-academy-id ausente' });
    return null;
  }
  try {
    return await databases.getDocument(DB_ID, process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '', academyId);
  } catch (e) {
    return res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
  }
}

function buildNotes() {
  const n = {
    history: [
      {
        type: 'lead_criado',
        text: 'Lead convertido manualmente via Inbox',
        at: new Date().toISOString()
      }
    ]
  };
  return JSON.stringify(n);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  if (!ensureJson(req, res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc || !academyDoc.$id) return;
  const academyId = String(academyDoc.$id || '').trim();

  const phone = normalizePhone(req.body?.phone || '');
  const name = String(req.body?.name || '').trim() || phone;
  const type = String(req.body?.type || 'Adulto').trim();
  const classificacao = req.body?.classificacao || {};
  if (!phone) return res.status(400).json({ sucesso: false, erro: 'phone ausente' });

  try {
    const list = await databases.listDocuments(DB_ID, LEADS_COL, [
      Query.equal('phone', [phone]),
      Query.equal('academyId', [academyId]),
      Query.limit(1)
    ]);
    const existing = list.documents && list.documents[0] ? list.documents[0] : null;
    if (existing && existing.$id) {
      return res.status(200).json({ sucesso: true, ja_existe: true, id: existing.$id });
    }

    const payload = {
      name,
      phone,
      type,
      status: 'Novo',
      origin: 'WhatsApp',
      academyId,
      intencao: String(classificacao?.intencao || '').trim() || '',
      prioridade: String(classificacao?.prioridade || '').trim() || '',
      lead_quente: String(classificacao?.lead_quente || '').trim() || '',
      precisa_resposta_humana: String(classificacao?.precisa_resposta_humana || '').trim() || '',
      notes: buildNotes()
    };

    const created = await databases.createDocument(
      DB_ID,
      LEADS_COL,
      ID.unique(),
      payload,
      [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
    );
    return res.status(200).json({ sucesso: true, ja_existe: false, id: created.$id });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
  }
}


