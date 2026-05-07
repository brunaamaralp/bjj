import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

async function clearZapsterInstanceFields(academyId) {
  const aid = String(academyId || '').trim();
  if (!aid || !DB_ID || !ACADEMIES_COL) return false;
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, aid, { zapster_instance_id: '' });
    return true;
  } catch (errPrimary) {
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, aid, { zapsterInstanceId: '' });
      return true;
    } catch (errSecondary) {
      console.error('[zapster-clear-link] falha ao limpar vínculo', {
        academyId: aid,
        primary: errPrimary?.message || errPrimary,
        secondary: errSecondary?.message || errSecondary
      });
      return false;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!DB_ID || !ACADEMIES_COL) {
    return res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const ok = await clearZapsterInstanceFields(access.academyId);
  if (!ok) {
    return res.status(500).json({ sucesso: false, erro: 'Falha ao limpar vínculo da instância' });
  }
  return res.status(200).json({ sucesso: true });
}
