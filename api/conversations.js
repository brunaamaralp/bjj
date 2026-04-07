import { Client, Databases, Query, Account, Teams, ID, Permission, Role } from 'node-appwrite';
import { humanHandoffUntilToMs, humanHandoffUntilFromMs } from '../lib/humanHandoffUntil.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL = process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) { res.status(status).json(obj); }

export default async function handler(req, res) {
  const phone = req.query.phone || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);

  if (!phone) {
    // Logic from index.js (List conversations)
    return json(res, 200, { sucesso: true, items: [], note: 'Conversas' });
  }

  // Individual conversation logic
  return json(res, 200, { phone, note: 'Detalhe da conversa' });
}
