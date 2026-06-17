import { apiErro, logApiError } from './friendlyError.js';
import { Account, Client, Databases, ID, Permission, Query, Role, Teams } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin } from './academyAccess.js';
import { setPlan } from '../../src/services/planService.js';
import { AGENT_HISTORY_WINDOW } from '../constants.js';
import { getPromptSettingsDocForSave, fetchAcademyPromptSettings } from './academyPromptSettings.js';
import { NAVI_WIZARD_MODULES_KEY } from '../naviWizardData.js';
import { parseFaqItems } from '../whatsappTemplateDefaults.js';
import { assertBillingActive, sendBillingGateError } from './billingGate.js';
import {
  validatePromptFields,
  isPromptContentConfigured,
  PROMPT_SUFFIX_MAX_LEN,
} from '../aiPromptLimits.js';
import {
  buildPromptBackupSnapshot,
  parsePromptBackupSnapshot,
} from './promptBackup.js';
import { assembleAgentSystemPromptBounded } from './assembleAgentSystemPrompt.js';
import { buildPromptContactContext, profileLineForSystemPrompt } from './agentPromptContext.js';
import { logStructured } from './structuredLog.js';
import { normalizeAiActionsConfig, normalizeAiModule, parseAcademyModules, mergeAiModuleIntoModulesString } from '../agentActionConfig.js';
import { mergeAiActionsIntoModulesString } from './agentActionPolicy.js';
import { assertAiModuleEnabled, sendAiFeatureDisabledError } from './aiFeaturePolicy.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const SETTINGS_COL = String(
  process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || ''
).trim();

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID) {
    res.status(500).json({ sucesso: false, erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
    return false;
  }
  if (!CONVERSATIONS_COL && !SETTINGS_COL) {
    res.status(500).json({ sucesso: false, erro: 'CONVERSATIONS_COL ou SETTINGS_COL deve estar configurado' });
    return false;
  }
  if (!ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'ACADEMIES_COL n\u00e3o configurado' });
    return false;
  }
  return true;
}


function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) perms.push(Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId)));
  if (teamId) perms.push(Permission.read(Role.team(teamId)), Permission.update(Role.team(teamId)), Permission.delete(Role.team(teamId)));
  if (perms.length > 0) return perms;
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

function isUnknownAttributeError(err, attrName) {
  const msg = String(err?.message || err || '');
  const attr = String(attrName || '').trim();
  if (!attr) return false;
  return msg.includes('Unknown attribute') && msg.includes(`"${attr}"`);
}

function readWizardDataFromModules(academyDoc) {
  try {
    const m = academyDoc?.modules;
    const parsed = typeof m === 'string' ? JSON.parse(m) : m;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const w = parsed[NAVI_WIZARD_MODULES_KEY];
      if (typeof w === 'string' && w.trim()) return w.trim();
    }
  } catch {
    void 0;
  }
  return '';
}

function aggregateWizardDataString(academyDoc, settingsDoc) {
  const a = String(academyDoc?.wizard_data ?? '').trim();
  if (a) return a;
  const s = String(settingsDoc?.wizard_data ?? '').trim();
  if (s) return s;
  return readWizardDataFromModules(academyDoc);
}

/**
 * Grava wizard_data: tenta coluna na academia \u2192 documento de settings \u2192 JSON em modules.
 * Compat\u00edvel com projetos Appwrite sem atributo wizard_data na cole\u00e7\u00e3o academies.
 */
async function saveWizardDataResilient(academyId, str, academyDoc, perms) {
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { wizard_data: str });
    return 'academy';
  } catch (e) {
    if (!isUnknownAttributeError(e, 'wizard_data')) throw e;
  }

  const { doc, coll, kind } = await getPromptSettingsDocForSave(academyId);
  if (coll) {
    try {
      if (doc) {
        await databases.updateDocument(DB_ID, coll, doc.$id, { wizard_data: str });
        return 'settings';
      }
      if (kind === 'settings') {
        await databases.createDocument(
          DB_ID,
          coll,
          ID.unique(),
          {
            academy_id: academyId,
            wizard_data: str,
            prompt_intro: '',
            prompt_body: '',
            prompt_suffix: ''
          },
          perms
        );
        return 'settings';
      }
      await databases.createDocument(
        DB_ID,
        coll,
        ID.unique(),
        {
          academy_id: academyId,
          phone_number: '__settings__',
          wizard_data: str,
          prompt_intro: '',
          prompt_body: '',
          prompt_suffix: ''
        },
        perms
      );
      return 'settings';
    } catch (e2) {
      if (!isUnknownAttributeError(e2, 'wizard_data')) throw e2;
    }
  }

  const fresh = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
  let mods = {};
  try {
    mods = fresh.modules ? (typeof fresh.modules === 'string' ? JSON.parse(fresh.modules) : fresh.modules) : {};
  } catch {
    mods = {};
  }
  if (!mods || typeof mods !== 'object' || Array.isArray(mods)) mods = {};
  mods[NAVI_WIZARD_MODULES_KEY] = str;
  await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { modules: JSON.stringify(mods) });
  return 'modules';
}

const IMPROVE_REPLY_SYSTEM = `Voc\u00ea \u00e9 um assistente que melhora rascunhos de mensagens de atendimento humano no WhatsApp para est\u00fadios fitness e academias de artes marciais (atendimento em portugu\u00eas do Brasil).

Sua tarefa: receber o contexto recente da conversa e o rascunho digitado pelo atendente; devolver APENAS o texto final melhorado, pronto para enviar.

Regras:
- Preserve o significado e a inten\u00e7\u00e3o do rascunho \u2014 n\u00e3o mude o recado principal.
- Tom caloroso, natural e profissional, como uma recepcionista experiente; adapte levemente ao tom que a pessoa (user) usa na conversa.
- Corrija gram\u00e1tica, pontua\u00e7\u00e3o e clareza; quebras de linha adequadas ao WhatsApp.
- Seja conciso quando o rascunho for curto; n\u00e3o alongue sem necessidade.
- N\u00c3O invente pre\u00e7os, hor\u00e1rios, endere\u00e7os, promo\u00e7\u00f5es ou pol\u00edticas que n\u00e3o apare\u00e7am explicitamente no contexto ou no rascunho.
- N\u00c3O diga que \u00e9 uma IA; n\u00e3o meta-coment\u00e1rios ("aqui est\u00e1 a vers\u00e3o melhorada").
- No m\u00e1ximo 1 emoji na mensagem, s\u00f3 se fizer sentido e o rascunho j\u00e1 sugerir algo informal; se n\u00e3o couber, zero emoji.
- Responda somente com o texto da mensagem melhorada, sem aspas, sem markdown, sem prefixos.`;

const GENERATE_PROMPT_SYSTEM = `Voc\u00ea \u00e9 especialista em criar prompts para assistentes virtuais de est\u00fadios fitness (yoga, pilates, dan\u00e7a, artes marciais, muscula\u00e7\u00e3o, etc).
Com base nas informa\u00e7\u00f5es fornecidas pelo gestor, gere um prompt completo e profissional para a assistente virtual do est\u00fadio.

Estrutura obrigat\u00f3ria do prompt gerado:
1. Identidade e personalidade da assistente (nome, tom, estilo)
2. Regra de grupos (nunca atender grupos do WhatsApp \u2014 retornar "" vazio)
3. Perfil do contato (como identificar lead vs aluno e adaptar atendimento)
4. Turmas e hor\u00e1rios (todas as turmas informadas)
5. Planos e pre\u00e7os (todos os planos informados)
6. Uniforme e equipamentos (se aplic\u00e1vel)
7. Aula/sess\u00e3o experimental (se oferecida)
8. Regras de tom de atendimento
9. Regras de formata\u00e7\u00e3o (sem blocos longos, m\u00e1x 1 emoji por mensagem)
10. Regras de vendas (funil r\u00e1pido, 1 pergunta por vez, CTA no momento certo)
11. Respostas ao cliente sempre em texto livre de conversa (WhatsApp): proibir markdown, listas com tra\u00e7o/n\u00famero, tabelas e r\u00f3tulos tipo \u201cResumo:\u201d nas mensagens enviadas ao lead

Importante:
- Adapte completamente ao tipo de est\u00fadio e modalidade informada
- N\u00e3o mencione outras academias ou marcas
- Use o nome da assistente informado pelo gestor
- Retorne APENAS o texto do prompt, sem markdown, sem explica\u00e7\u00f5es, sem t\u00edtulos com #, sem blocos de c\u00f3digo`;

async function readJsonBodyForPost(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return null;
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function normalizePhoneForImprove(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function safeParseMessagesForImprove(raw) {
  if (raw === null || raw === undefined || raw === '') return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((m) => m && typeof m === 'object')
      .map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: typeof m.content === 'string' ? m.content : String(m.content || ''),
        timestamp: typeof m.timestamp === 'string' ? m.timestamp : '',
        sender: typeof m.sender === 'string' ? m.sender : undefined
      }));
  } catch {
    return [];
  }
}

async function callClaudeImprove({ system, messages, maxTokens, temperature }) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
      'x-api-key': ANTHROPIC_API_KEY
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      temperature,
      system,
      messages
    })
  });

  const raw = await resp.text();
  if (!resp.ok) {
    let msg = raw.slice(0, 500);
    try {
      const err = JSON.parse(raw);
      if (err?.error?.message) msg = String(err.error.message);
    } catch {
      void 0;
    }
    throw new Error(msg || 'Falha ao chamar Claude');
  }
  const data = JSON.parse(raw);
  const parts = Array.isArray(data?.content) ? data.content : [];
  return parts
    .filter((p) => p && p.type === 'text')
    .map((p) => String(p.text || ''))
    .join('\n')
    .trim();
}

async function handleImproveReply(res, academyId, body) {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ sucesso: false, erro: apiErro({ message: 'ANTHROPIC_API_KEY' }, 'action') });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ sucesso: false, erro: 'Body inv\u00e1lido' });
  }

  const bodyAcademy = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademy && bodyAcademy !== academyId) {
    return res.status(400).json({ sucesso: false, erro: 'academyId do body n\u00e3o confere com o cabe\u00e7alho' });
  }

  const phone = normalizePhoneForImprove(body.phone);
  if (!phone) {
    return res.status(400).json({ sucesso: false, erro: 'phone ausente ou inv\u00e1lido' });
  }

  const draft = typeof body.draft === 'string' ? body.draft : String(body.draft || '');
  if (!draft.trim()) {
    return res.status(400).json({ sucesso: false, erro: 'draft ausente' });
  }

  let messages = [];
  try {
    const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
      Query.equal('phone_number', [phone]),
      Query.equal('academy_id', [academyId]),
      Query.orderDesc('updated_at'),
      Query.limit(1)
    ]);
    const existing = list.documents && list.documents[0] ? list.documents[0] : null;
    const all = existing ? safeParseMessagesForImprove(existing.messages) : [];
    messages = all.slice(-AGENT_HISTORY_WINDOW);
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'load') });
  }

  const contextLines = messages.map((m) => {
    const who = m.role === 'assistant' ? 'assistente' : 'cliente';
    const tag = m.sender === 'human' ? ' (humano)' : '';
    return `${who}${tag}: ${m.content}`;
  });

  const userContent = [
    contextLines.length ? `\u00daltimas mensagens (mais antigas \u2192 mais recentes):\n${contextLines.join('\n\n')}` : '(Sem mensagens anteriores no hist\u00f3rico.)',
    '',
    'Rascunho do atendente para melhorar:',
    draft.trim()
  ].join('\n');

  let improved = '';
  try {
    improved = await callClaudeImprove({
      system: IMPROVE_REPLY_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 900,
      temperature: 0.35
    });
  } catch (e) {
    return res.status(502).json({ sucesso: false, erro: apiErro(e, 'action') });
  }

  if (!improved.trim()) {
    return res.status(502).json({ sucesso: false, erro: 'Resposta vazia da IA' });
  }

  return res.status(200).json({ sucesso: true, improved: improved.trim() });
}

async function handleGeneratePrompt(res, academyId, body) {
  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({ sucesso: false, erro: apiErro({ message: 'ANTHROPIC_API_KEY' }, 'action') });
  }
  if (!body || typeof body !== 'object') {
    return res.status(400).json({ sucesso: false, erro: 'Body inv\u00e1lido' });
  }

  const bodyAcademy = String(body.academyId || body.academy_id || '').trim();
  if (bodyAcademy && bodyAcademy !== academyId) {
    return res.status(400).json({ sucesso: false, erro: 'academyId do body n\u00e3o confere com o cabe\u00e7alho' });
  }

  const wizardData = body.wizardData;
  if (!wizardData || typeof wizardData !== 'object' || Array.isArray(wizardData)) {
    return res.status(400).json({ sucesso: false, erro: 'wizardData ausente ou inv\u00e1lido' });
  }

  const userContent = `Dados do est\u00fadio fornecidos pelo gestor:\n${JSON.stringify(wizardData, null, 2)}\n\nGere o prompt completo para a assistente virtual deste est\u00fadio.`;

  let prompt = '';
  try {
    prompt = await callClaudeImprove({
      system: GENERATE_PROMPT_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 2000,
      temperature: 0.45
    });
  } catch (e) {
    return res.status(502).json({ sucesso: false, erro: apiErro(e, 'action') });
  }

  if (!prompt.trim()) {
    return res.status(500).json({ sucesso: false, erro: 'Prompt gerado vazio' });
  }

  console.log('[ai-prompt] generate_prompt conclu\u00eddo', { academyId });
  return res.status(200).json({ sucesso: true, prompt: prompt.trim() });
}

export default async function handler(req, res) {
  if (!ensureConfigOk(res)) return;
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { doc: academyDoc, academyId } = access;

  try {
    await assertBillingActive(academyId);
  } catch (e) {
    if (sendBillingGateError(res, e)) return;
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'action') });
  }

  try {
    if (req.method === 'POST') {
      const body = (await readJsonBodyForPost(req)) || {};
      const action = String(body.action || '').trim().toLowerCase();
      if (action === 'generate_prompt' || action === 'improve_reply') {
        const editor = await ensureAcademyOwnerOrAdmin(req, res, me);
        if (!editor) return;
        try {
          assertAiModuleEnabled(academyDoc);
        } catch (e) {
          if (sendAiFeatureDisabledError(res, e)) return;
          throw e;
        }
      }
      if (action === 'generate_prompt') {
        return handleGeneratePrompt(res, academyId, body);
      }
      if (action === 'improve_reply') {
        return handleImproveReply(res, academyId, body);
      }
      res.setHeader('Allow', 'GET, PUT, POST, PATCH');
      return res.status(405).json({ sucesso: false, erro: 'Use action: improve_reply ou generate_prompt no body JSON' });
    }

    if (req.method === 'GET') {
      const { doc } = await getPromptSettingsDocForSave(academyId);
      const plan = String(academyDoc?.plan || 'starter').trim().toLowerCase();
      const safePlan = ['starter', 'studio', 'pro'].includes(plan) ? plan : 'starter';
      const wizardData = aggregateWizardDataString(academyDoc, doc);
      const backupSnap = parsePromptBackupSnapshot(
        doc?.prompt_backup_snapshot,
        doc?.prompt_intro_backup,
        doc?.prompt_body_backup,
        doc?.prompt_suffix_backup
      );
      const out = {
        prompt_intro: String(doc?.prompt_intro || '').trim(),
        prompt_body: String(doc?.prompt_body || '').trim(),
        prompt_suffix: String(doc?.prompt_suffix || '').trim(),
        prompt_intro_backup: String(backupSnap?.intro || doc?.prompt_intro_backup || '').trim(),
        prompt_body_backup: String(backupSnap?.body || doc?.prompt_body_backup || '').trim(),
        prompt_suffix_backup: String(backupSnap?.suffix || doc?.prompt_suffix_backup || '').trim(),
        prompt_backup_snapshot: backupSnap,
        prompt_updated_at: String(doc?.prompt_updated_at || '').trim(),
        prompt_updated_by: String(doc?.prompt_updated_by || '').trim(),
        ia_ativa: academyDoc?.ia_ativa === true,
        birthdayMessage: String(academyDoc?.birthdayMessage || '')
          .trim()
          .replaceAll('{nome}', '{primeiroNome}'),
        faq_data: String(academyDoc?.faq_data ?? ''),
        ai_name: String(academyDoc?.ai_name || '').trim(),
        academy_name: String(academyDoc?.name || '').trim(),
        plan: safePlan,
        ai_threads_used: Number(academyDoc?.ai_threads_used) || 0,
        ai_threads_limit: Number(academyDoc?.ai_threads_limit) || 300,
        ai_overage_enabled: academyDoc?.ai_overage_enabled !== false && academyDoc?.ai_overage_enabled !== 'false',
        test_messages_today: Number(academyDoc?.test_messages_today) || 0,
        test_messages_reset_date: String(academyDoc?.test_messages_reset_date || '').trim(),
        billing_cycle_day: Math.min(
          Math.max(parseInt(String(academyDoc?.billing_cycle_day ?? 1), 10) || 1, 1),
          28
        ),
        wizard_data: wizardData,
        ai_actions: normalizeAiActionsConfig(parseAcademyModules(academyDoc?.modules).ai_actions),
        ai_module: normalizeAiModule(parseAcademyModules(academyDoc?.modules).ai),
      };
      return res.status(200).json({ sucesso: true, ...out });
    }

    if (req.method === 'PATCH') {
      const body = (await readJsonBodyForPost(req)) || {};
      const patchAction = String(body.action || '').trim().toLowerCase();
      const needsEditor =
        patchAction === 'save_wizard_data' ||
        patchAction === 'toggle_ia' ||
        patchAction === 'update_ai_settings' ||
        patchAction === 'set_plan' ||
        patchAction === 'save_birthday_message' ||
        patchAction === 'save_faq_data' ||
        patchAction === 'save_ai_actions' ||
        patchAction === 'save_ai_module';
      if (needsEditor) {
        const editor = await ensureAcademyOwnerOrAdmin(req, res, me);
        if (!editor) return;
      }
      if (patchAction === 'save_wizard_data') {
        const raw =
          typeof body.wizard_data === 'string' ? body.wizard_data : JSON.stringify(body.wizard_data ?? {});
        const str = String(raw || '').trim();
        if (!str) {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data vazio' });
        }
        if (str.length > 10000) {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data excede 10.000 caracteres' });
        }
        try {
          JSON.parse(str);
        } catch {
          return res.status(400).json({ sucesso: false, erro: 'wizard_data JSON inv\u00e1lido' });
        }
        const perms = permissionsForAcademyDoc(academyDoc);
        const where = await saveWizardDataResilient(academyId, str, academyDoc, perms);
        return res.status(200).json({ sucesso: true, wizard_store: where });
      }
      if (patchAction === 'save_birthday_message') {
        const msg = String(body.birthdayMessage || '')
          .trim()
          .slice(0, 500)
          .replaceAll('{nome}', '{primeiroNome}');
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          birthdayMessage: msg
        });
        return res.status(200).json({ sucesso: true, birthdayMessage: msg });
      }
      if (patchAction === 'save_ai_actions') {
        const enabled = body.enabled !== false && body.ai_actions_enabled !== false;
        const rawActions = body.actions ?? body.ai_actions;
        const fresh = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const prevCfg = normalizeAiActionsConfig(parseAcademyModules(fresh?.modules).ai_actions);
        const cfg = normalizeAiActionsConfig({
          enabled,
          actions: Array.isArray(rawActions) ? rawActions : undefined,
          conversation_timeline:
            body.conversation_timeline && typeof body.conversation_timeline === 'object'
              ? body.conversation_timeline
              : prevCfg.conversation_timeline,
        });
        const modulesStr = mergeAiActionsIntoModulesString(fresh?.modules, cfg);
        if (modulesStr.length > 65535) {
          return res.status(400).json({ sucesso: false, erro: 'modules excede limite do Appwrite' });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { modules: modulesStr });
        logStructured('ai_prompt_save_ai_actions', {
          academy_id: academyId,
          userId: me.$id,
          enabled: cfg.enabled,
          actions: cfg.actions,
        });
        return res.status(200).json({ sucesso: true, ai_actions: cfg });
      }
      if (patchAction === 'save_ai_module') {
        const enabled = body.enabled !== false && body.ai_module_enabled !== false;
        const fresh = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        const modulesStr = mergeAiModuleIntoModulesString(fresh?.modules, { enabled });
        if (modulesStr.length > 65535) {
          return res.status(400).json({ sucesso: false, erro: 'modules excede limite do Appwrite' });
        }
        const patch = { modules: modulesStr };
        if (!enabled) {
          patch.ia_ativa = false;
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, patch);
        const cfg = normalizeAiModule({ enabled });
        logStructured('ai_prompt_save_ai_module', {
          academy_id: academyId,
          userId: me.$id,
          enabled: cfg.enabled,
        });
        return res.status(200).json({ sucesso: true, ai_module: cfg, ia_ativa: enabled ? academyDoc?.ia_ativa === true : false });
      }
      if (patchAction === 'save_faq_data') {
        let arr;
        if (Array.isArray(body.faq_data)) arr = body.faq_data;
        else if (typeof body.faq_data === 'string') {
          const s = String(body.faq_data || '').trim();
          if (!s) {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { faq_data: '' });
            return res.status(200).json({ sucesso: true, faq_data: '' });
          }
          try {
            arr = JSON.parse(s);
          } catch {
            return res.status(400).json({ sucesso: false, erro: 'faq_data JSON inv\u00e1lido' });
          }
        } else {
          return res.status(400).json({ sucesso: false, erro: 'faq_data inv\u00e1lido' });
        }
        const normalized = parseFaqItems(arr);
        const str = JSON.stringify(normalized);
        if (str.length > 10000) {
          return res.status(400).json({ sucesso: false, erro: 'faq_data excede 10.000 caracteres' });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { faq_data: str });
        return res.status(200).json({ sucesso: true, faq_data: str });
      }
      if (patchAction === 'toggle_ia') {
        const novoStatus = Boolean(body.ia_ativa);
        if (novoStatus) {
          try {
            assertAiModuleEnabled(academyDoc);
          } catch (e) {
            if (sendAiFeatureDisabledError(res, e)) return;
            throw e;
          }
          const ps = await fetchAcademyPromptSettings(academyId);
          if (!isPromptContentConfigured(ps.intro, ps.body)) {
            return res.status(400).json({
              sucesso: false,
              erro: 'Configure identidade ou conhecimento do assistente antes de ativar a IA.',
              code: 'prompt_nao_configurado',
            });
          }
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
          ia_ativa: novoStatus,
        });
        logStructured('ai_prompt_toggle_ia', {
          academy_id: academyId,
          userId: me.$id,
          ia_ativa: novoStatus,
        });
        return res.status(200).json({ sucesso: true, ia_ativa: novoStatus });
      }
      if (patchAction === 'set_plan') {
        const p = String(body.plan || '')
          .trim()
          .toLowerCase();
        if (!['starter', 'studio', 'pro'].includes(p)) {
          return res.status(400).json({ sucesso: false, erro: 'plan inv\u00e1lido (starter, studio ou pro)' });
        }
        await setPlan(academyId, p, academyDoc);
        return res.status(200).json({ sucesso: true, plan: p });
      }
      if (patchAction === 'update_ai_settings') {
        const patch = {};
        if (body.ai_name !== undefined) {
          const n = String(body.ai_name || '').trim().slice(0, 80);
          if (!n) {
            return res.status(400).json({ sucesso: false, erro: 'ai_name n\u00e3o pode ser vazio' });
          }
          patch.ai_name = n;
        }
        if (body.ai_overage_enabled !== undefined) {
          patch.ai_overage_enabled = Boolean(body.ai_overage_enabled);
        }
        if (body.billing_cycle_day !== undefined) {
          const d = parseInt(String(body.billing_cycle_day), 10);
          if (!Number.isFinite(d) || d < 1 || d > 28) {
            return res.status(400).json({ sucesso: false, erro: 'billing_cycle_day deve ser entre 1 e 28' });
          }
          patch.billing_cycle_day = d;
        }
        if (Object.keys(patch).length === 0) {
          return res.status(400).json({ sucesso: false, erro: 'Nenhum campo para atualizar' });
        }
        await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, patch);
        return res.status(200).json({ sucesso: true, ...patch });
      }
      res.setHeader('Allow', 'GET, PUT, POST, PATCH');
      return res.status(405).json({
        sucesso: false,
        erro:
          'Use action: save_wizard_data, toggle_ia, save_birthday_message, save_faq_data, save_ai_actions, set_plan ou update_ai_settings no body JSON'
      });
    }

    if (req.method === 'PUT') {
      const editor = await ensureAcademyOwnerOrAdmin(req, res, me);
      if (!editor) return;

      const body = req.body || {};
      const intro = String(body.prompt_intro || '').trim();
      const bodyTxt = String(body.prompt_body || '').trim();
      const suffix = String(body.prompt_suffix || '').trim().slice(0, PROMPT_SUFFIX_MAX_LEN);

      const fieldCheck = validatePromptFields(intro, bodyTxt);
      if (!fieldCheck.ok) {
        return res.status(400).json({ sucesso: false, erro: fieldCheck.erro });
      }

      const faqItems = parseFaqItems(academyDoc?.faq_data);
      const contactCtx = buildPromptContactContext(null, 'amigo');
      const bounded = assembleAgentSystemPromptBounded({
        effectiveIntro: intro,
        effectiveBody: bodyTxt,
        extraSuffix: suffix,
        profileLine: profileLineForSystemPrompt(contactCtx),
        nomeContatoLine: contactCtx.nomeContatoLine,
        summaryText: '',
        faqItems,
      });
      if (bounded.warning) {
        logStructured('ai_prompt_system_truncated', {
          academy_id: academyId,
          userId: me.$id,
          warning: bounded.warning,
        });
      }

      const perms = permissionsForAcademyDoc(academyDoc);
      const { doc, coll, kind } = await getPromptSettingsDocForSave(academyId);
      const nowIso = new Date().toISOString();
      const prevIntro = doc ? String(doc?.prompt_intro || '').trim() : '';
      const prevBody = doc ? String(doc?.prompt_body || '').trim() : '';
      const prevSuffix = doc ? String(doc?.prompt_suffix || '').trim() : '';

      const snapshotJson = buildPromptBackupSnapshot(prevIntro, prevBody, prevSuffix);

      const dataWithBackup = {
        prompt_intro: intro,
        prompt_body: bodyTxt,
        prompt_suffix: suffix,
        prompt_backup_snapshot: snapshotJson,
        prompt_intro_backup: prevIntro,
        prompt_body_backup: prevBody,
        prompt_suffix_backup: prevSuffix,
        prompt_updated_at: nowIso,
        prompt_updated_by: String(me.$id || '').trim(),
      };
      const dataFallback = {
        prompt_intro: intro,
        prompt_body: bodyTxt,
        prompt_suffix: suffix,
        prompt_updated_by: String(me.$id || '').trim(),
      };

      logStructured('ai_prompt_save', {
        academy_id: academyId,
        userId: me.$id,
        introLen: intro.length,
        bodyLen: bodyTxt.length,
        systemLen: bounded.system.length,
        truncated: bounded.truncated,
      });

      const shouldRetryWithoutBackup = (e) => {
        const msg = String(e?.message || e || '');
        return (
          msg.includes('prompt_backup_snapshot') ||
          msg.includes('prompt_intro_backup') ||
          msg.includes('prompt_body_backup') ||
          msg.includes('prompt_suffix_backup') ||
          msg.includes('prompt_updated_at') ||
          msg.includes('prompt_updated_by')
        );
      };

      if (doc) {
        try {
          await databases.updateDocument(DB_ID, coll, doc.$id, dataWithBackup);
        } catch (e) {
          if (!shouldRetryWithoutBackup(e)) throw e;
          await databases.updateDocument(DB_ID, coll, doc.$id, dataFallback);
        }
        return res.status(200).json({ sucesso: true });
      }
      if (kind === 'settings') {
        try {
          await databases.createDocument(
            DB_ID,
            coll,
            ID.unique(),
            { academy_id: academyId, ...dataWithBackup },
            perms
          );
        } catch (e) {
          if (!shouldRetryWithoutBackup(e)) throw e;
          await databases.createDocument(
            DB_ID,
            coll,
            ID.unique(),
            { academy_id: academyId, ...dataFallback },
            perms
          );
        }
        return res.status(200).json({ sucesso: true });
      }

      try {
        await databases.createDocument(
          DB_ID,
          coll,
          ID.unique(),
          { academy_id: academyId, phone_number: '__settings__', ...dataWithBackup },
          perms
        );
      } catch (e) {
        if (!shouldRetryWithoutBackup(e)) throw e;
        await databases.createDocument(
          DB_ID,
          coll,
          ID.unique(),
          { academy_id: academyId, phone_number: '__settings__', ...dataFallback },
          perms
        );
      }
      return res.status(200).json({ sucesso: true });
    }

    res.setHeader('Allow', 'GET, PUT, POST, PATCH');
    return res.status(405).json({ sucesso: false, erro: 'M\u00e9todo n\u00e3o permitido' });
  } catch (e) {
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'action') });
  }
}
