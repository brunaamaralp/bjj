import { Client, Databases, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !LEADS_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  if (!DEFAULT_ACADEMY_ID) {
    res.status(500).json({ sucesso: false, erro: 'DEFAULT_ACADEMY_ID não configurado' });
    return false;
  }
  return true;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }
  if (!ensureConfigOk(res)) return;

  try {
    const list = await databases.listDocuments(DB_ID, LEADS_COL, [
      Query.equal('academyId', [DEFAULT_ACADEMY_ID]),
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
    for (const doc of list.documents) {
      let parsed = {};
      try {
        parsed = doc.notes ? JSON.parse(doc.notes) : {};
      } catch {
        parsed = {};
      }
      const needHuman = String(parsed?.needHuman || '').toLowerCase() === 'sim';
      const priority = String(parsed?.whatsappPriority || '').toLowerCase();
      const hotLead = String(parsed?.whatsappLeadQuente || '').toLowerCase() === 'sim';
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
