import { Account, Client, Databases, Query, Teams } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import {
  assembleAgentSystemPrompt,
  COMMUNICATION_RULES,
  buildClassificationBlock
} from './assembleAgentSystemPrompt.js';
import { fetchAcademyPromptSettings } from './academyPromptSettings.js';
import { buildPromptContactContext, profileLineForSystemPrompt } from './agentPromptContext.js';
import { parseFaqItems } from '../whatsappTemplateDefaults.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';


const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
    return false;
  }
  return true;
}


const SYSTEM_PROMPT_INTRO = '';
const SYSTEM_PROMPT_BODY = '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
  }
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { doc: academyDoc, academyId } = access;

  try {
    const settings = await fetchAcademyPromptSettings(academyId);
    const effectiveIntro = String(settings.intro || '') || SYSTEM_PROMPT_INTRO;
    const effectiveBody = String(settings.body || '') || SYSTEM_PROMPT_BODY;
    const extraSuffix = String(settings.suffix || '').trim();

    const exemploNomeWa = 'Maria Silva';
    const contactCtx = buildPromptContactContext(null, exemploNomeWa);
    const profileLine = profileLineForSystemPrompt(contactCtx);

    const faqItems = parseFaqItems(academyDoc?.faq_data);
    const summaryPreview =
      '(Exemplo de pr\u00e9via \u2014 sem resumo persistido. Na conversa real, um resumo curto pode aparecer aqui quando existir.)';
    const texto = assembleAgentSystemPrompt({
      effectiveIntro,
      effectiveBody,
      extraSuffix,
      profileLine,
      nomeContatoLine: contactCtx.nomeContatoLine,
      summaryText: summaryPreview,
      faqItems
    });

    const preview_sections = [
      { label: 'IDENTIDADE DO ASSISTENTE', content: effectiveIntro || '(n\u00e3o configurado)' },
      { label: 'REGRAS DE COMUNICA\u00c7\u00c3O (sistema)', content: COMMUNICATION_RULES },
      { label: 'PERFIL DO LEAD (din\u00e2mico)', content: '[ gerado automaticamente por conversa ]' },
      { label: 'INFORMA\u00c7\u00d5ES DA ACADEMIA', content: effectiveBody || '(n\u00e3o configurado)' },
      { label: 'REGRAS ESPEC\u00cdFICAS', content: extraSuffix || '(nenhuma)' },
      { label: 'CLASSIFICA\u00c7\u00c3O JSON (sistema)', content: buildClassificationBlock() }
    ];

    return res.status(200).json({
      sucesso: true,
      prompt: texto,
      preview_sections,
      settings_source: settings.source,
      exemplo: { whatsappDisplayName: exemploNomeWa, leadDoc: null }
    });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
  }
}
