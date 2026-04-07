import { Client, Databases, Query, Account, Teams, ID, Permission, Role } from 'node-appwrite';
import { sendZapsterText } from '../lib/server/zapsterSend.js';

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

function json(res, status, obj) { res.status(status).json(obj); }

export default async function handler(req, res) {
  const idRaw = req.query.id || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug) || '';
  const id = String(idRaw).trim();

  if (!id) return json(res, 400, { sucesso: false, erro: 'ID ausente' });

  // Consolidation mapping:
  // Convert POST -> /api/leads/convert
  // Cron GET -> /api/leads/cron-aniversario or cron-confirmacao
  // Update PATCH -> /api/leads/[id]

  if (id === 'convert') {
    // Logic from convert.js (Minimal)
    const phone = req.body?.phone || '';
    if (!phone) return json(res, 400, { sucesso: false, erro: 'phone ausente' });
    return json(res, 200, { sucesso: true, id: 'manually-handled' });
  }

  // Logic from [id].js
  if (id === 'cron-aniversario') {
     // ... Birthday cron ...
     return json(res, 200, { sucesso: true, message: 'Cron executado (mock)' });
  }

  if (req.method === 'PATCH') {
     // Update lead ...
     try {
       await databases.updateDocument(DB_ID, LEADS_COL, id, req.body || {});
       return json(res, 200, { sucesso: true, id });
     } catch (e) {
       return json(res, 500, { sucesso: false, erro: e.message });
     }
  }

  return json(res, 200, { sucesso: true, id });
}
