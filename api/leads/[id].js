import { Client, Databases, Query, Account, Teams } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);
const teams = new Teams(client);

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-academy-id');
}

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL não configurado' });
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
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return academyId;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return academyId;
      } catch {
        void 0;
      }
    }

    res.status(403).json({ sucesso: false, erro: 'Acesso negado à academia' });
    return null;
  } catch (e) {
    res.status(500).json({ sucesso: false, erro: e?.message || 'Erro ao validar academia' });
    return null;
  }
}

function toBoolSim(v) {
  return String(v || '').trim().toLowerCase() === 'sim';
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
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, PATCH, OPTIONS');
    return res.status(204).end();
  }
  if (!ensureConfigOk(res)) return;
  const id = req.query?.id || '';
  if (!id) return res.status(400).json({ sucesso: false, erro: 'ID ausente' });

  const me = await ensureAuth(req, res);
  if (!me) return;

  const academyId = await ensureAcademyAccess(req, res, me);
  if (!academyId) return;

  if (req.method === 'GET') {
    if (String(id) !== 'pendentes') {
      res.setHeader('Allow', 'GET, PATCH, OPTIONS');
      return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
    }
    try {
      const list = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('academyId', [academyId]),
        Query.equal('status', ['Novo']),
        Query.limit(500),
        Query.orderDesc('$createdAt'),
      ]);
      const now = Date.now();
      const cats = {
        precisa_resposta_humana: [],
        prioridade_alta_parado: [],
        lead_quente_sem_atendimento: [],
        abandonado: [],
      };
      const pushLead = (arr, doc, parsed) => {
        const intention = parsed?.whatsappIntention || '';
        const priority = parsed?.whatsappPriority || '';
        const hotLead = String(parsed?.whatsappLeadQuente || '').toLowerCase() === 'sim';
        const needHuman = String(parsed?.needHuman || '').toLowerCase() === 'sim';
        arr.push({
          id: doc.$id,
          name: doc.name,
          phone: doc.phone,
          status: doc.status,
          origin: doc.origin || '',
          createdAt: doc.$createdAt,
          intention,
          priority,
          hotLead,
          needHuman,
        });
      };
      const seen = new Set();
      const docs = Array.isArray(list?.documents) ? list.documents : [];
      for (const doc of docs) {
        let parsed = {};
        try {
          parsed = doc.notes ? JSON.parse(doc.notes) : {};
        } catch {
          parsed = {};
        }
        const needHuman = toBoolSim(parsed?.needHuman);
        const priority = String(parsed?.whatsappPriority || '').toLowerCase();
        const hotLead = toBoolSim(parsed?.whatsappLeadQuente);
        const createdMs = new Date(doc.$createdAt).getTime();
        const ageH = (now - createdMs) / 3600000;
        if (needHuman) {
          pushLead(cats.precisa_resposta_humana, doc, parsed);
          seen.add(doc.$id);
        }
        if (priority === 'alta' && ageH > 6) {
          pushLead(cats.prioridade_alta_parado, doc, parsed);
          seen.add(doc.$id);
        }
        if (hotLead && ageH > 12) {
          pushLead(cats.lead_quente_sem_atendimento, doc, parsed);
          seen.add(doc.$id);
        }
        if (ageH > 24) {
          pushLead(cats.abandonado, doc, parsed);
          seen.add(doc.$id);
        }
      }
      return res.status(200).json({
        total: seen.size,
        por_categoria: cats,
      });
    } catch (e) {
      return res.status(500).json({ sucesso: false, erro: e.message || 'Erro interno' });
    }
  }

  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'GET, PATCH, OPTIONS');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureJson(req, res)) return;

  try {
    const doc = await databases.getDocument(DB_ID, LEADS_COL, id);
    const leadAcademy = String(doc?.academyId || '').trim();
    if (!leadAcademy || leadAcademy !== academyId) {
      return res.status(403).json({ sucesso: false, erro: 'Lead não pertence à academia' });
    }
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
