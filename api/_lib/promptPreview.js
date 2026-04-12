import { Account, Client, Databases, Query, Teams } from 'node-appwrite';
import { assembleAgentSystemPrompt } from '../../lib/server/assembleAgentSystemPrompt.js';
import { fetchAcademyPromptSettings } from '../../lib/server/academyPromptSettings.js';
import { buildPromptContactContext, profileLineForSystemPrompt } from '../../lib/server/agentPromptContext.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const DEFAULT_ACADEMY_ID = process.env.DEFAULT_ACADEMY_ID || process.env.VITE_DEFAULT_ACADEMY_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
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
    return await account.get();
  } catch {
    res.status(401).json({ sucesso: false, erro: 'JWT inválido' });
    return null;
  }
}

function resolveAcademyId(req) {
  const h = String(req.headers['x-academy-id'] || '').trim();
  if (h) return h;
  const q = String(req.query?.academyId || req.query?.academy_id || '').trim();
  if (q) return q;
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
    if (ownerId && userId && ownerId === userId) return doc;

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return doc;
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

const SYSTEM_PROMPT_INTRO = '';
const SYSTEM_PROMPT_BODY = '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const academyDoc = await ensureAcademyAccess(req, res, me);
  if (!academyDoc) return;
  const academyId = String(academyDoc.$id || '').trim();

  try {
    const settings = await fetchAcademyPromptSettings(academyId);
    const effectiveIntro = String(settings.intro || '') || SYSTEM_PROMPT_INTRO;
    const effectiveBody = String(settings.body || '') || SYSTEM_PROMPT_BODY;
    const extraSuffix = String(settings.suffix || '').trim();

    const exemploNomeWa = 'Maria Silva';
    const contactCtx = buildPromptContactContext(null, exemploNomeWa);
    const profileLine = profileLineForSystemPrompt(contactCtx);

    const texto = assembleAgentSystemPrompt({
      effectiveIntro,
      effectiveBody,
      extraSuffix,
      profileLine,
      nomeContatoLine: contactCtx.nomeContatoLine,
      summaryText:
        '(Exemplo de prévia — sem resumo persistido. Na conversa real, um resumo curto pode aparecer aqui quando existir.)'
    });

    return res.status(200).json({
      sucesso: true,
      prompt: texto,
      settings_source: settings.source,
      exemplo: { whatsappDisplayName: exemploNomeWa, leadDoc: null }
    });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
  }
}
