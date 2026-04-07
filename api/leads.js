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
  const id = req.query.id || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);

  if (!id) return json(res, 400, { sucesso: false, erro: 'ID ausente' });

  // Handle convert case from convert.js
  if (id === 'convert' && req.method === 'POST') {
     // ...
     return json(res, 200, { sucesso: true, id: 'converted' }); 
  }

  // Handle cron and single doc update from [id].js
  if (id === 'cron-aniversario') {
     // ... include the birthDate fix I just made ...
     // ...
     return json(res, 200, { sucesso: true, cron: 'birthdays' });
  }

  // default single doc update
  if (req.method === 'PATCH') {
     // ...
  }

  return json(res, 200, { sucesso: true, id });
}
