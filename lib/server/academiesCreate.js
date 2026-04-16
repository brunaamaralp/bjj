import { Client, Databases, Permission, Role, Account, Teams, ID, Query } from 'node-appwrite';
import { ensureTrialSubscription } from '../billing/ensureTrial.js';
import { isBillingApiLive } from './billingApiEnabled.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

async function maybeEnsureTrial(academyId) {
  if (!isBillingApiLive()) return;
  try {
    await ensureTrialSubscription(academyId);
  } catch (e) {
    console.warn('[academies/create] ensureTrial (academia j\u00e1 criada; corrija permiss\u00f5es billing se necess\u00e1rio)', {
      message: e?.message,
      code: e?.code,
      type: e?.type,
    });
  }
}

async function readJsonBody(req) {
  if (req?.body && typeof req.body === 'object') return req.body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    if (chunks.length === 0) return {};
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function ensureConfigOk(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
    return false;
  }
  return true;
}

/** Appwrite devolve "Unknown attribute: \"campo\"" se o schema da cole\u00e7\u00e3o for mais antigo que o c\u00f3digo. */
function parseUnknownAttributeFromMessage(msg) {
  const s = String(msg || '');
  let m = s.match(/Unknown attribute:\s*"([^"]+)"/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*'([^']+)'/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*([\w.]+)/i);
  return m ? m[1] : null;
}

/**
 * Cria documento omitindo chaves que o projeto Appwrite ainda n\u00e3o tem como atributos.
 */
async function createAcademyDocumentResilient(databases, payload, perms) {
  const docId = ID.unique();
  let data = { ...payload };
  for (let i = 0; i < 48; i++) {
    try {
      return await databases.createDocument(DB_ID, ACADEMIES_COL, docId, data, perms);
    } catch (err) {
      const bad = parseUnknownAttributeFromMessage(err?.message);
      if (!bad || !Object.prototype.hasOwnProperty.call(data, bad)) throw err;
      console.warn('[academies/create] schema sem atributo; removendo da cria\u00e7\u00e3o:', bad);
      const next = { ...data };
      delete next[bad];
      data = next;
    }
  }
  throw new Error('N\u00e3o foi poss\u00edvel criar academia: schema incompat\u00edvel (muitos atributos rejeitados)');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }
  if (!ensureConfigOk(res)) return;
  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ sucesso: false, erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return res.status(401).json({ sucesso: false, erro: 'JWT inv\u00e1lido' });
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    const me = await account.get();
    const ownerId = me.$id;
    const userTeams = new Teams(userClient);
    const body = await readJsonBody(req);

    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);

    const permsFor = (teamId) => {
      const p = [Permission.read(Role.user(ownerId)), Permission.update(Role.user(ownerId)), Permission.delete(Role.user(ownerId))];
      const tid = String(teamId || '').trim();
      if (tid) {
        p.push(Permission.read(Role.team(tid)), Permission.update(Role.team(tid)));
      }
      return p;
    };

    const createTeamForOwner = async () => {
      const display = String(me?.name || '').trim() || 'Equipe';
      const team = await userTeams.create(ID.unique(), display);
      return String(team?.$id || team?.id || '').trim();
    };

    let existing = null;
    try {
      const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, [Query.equal('ownerId', [ownerId]), Query.limit(1)]);
      existing = Array.isArray(list?.documents) && list.documents[0] ? list.documents[0] : null;
    } catch {
      existing = null;
    }

    if (existing && existing.$id) {
      const academyId = String(existing.$id || '').trim();
      const teamIdExisting = String(existing.teamId || '').trim();
      if (teamIdExisting) {
        await maybeEnsureTrial(academyId);
        return res.status(200).json({ sucesso: true, id: academyId, teamId: teamIdExisting });
      }

      const teamId = await createTeamForOwner().catch((err) => {
        console.warn('[academies/create] createTeamForOwner (existing academy)', err?.message || err);
        return '';
      });
      if (teamId) {
        const perms = permsFor(teamId);
        try {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { teamId }, perms);
        } catch {
          await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, { teamId });
        }
      }
      await maybeEnsureTrial(academyId);
      return res.status(200).json({ sucesso: true, id: academyId, teamId: teamId || '' });
    }

    const defaultFinance = {
      cardFees: {
        pix: { percent: 0, fixed: 0 },
        debito: { percent: 0, fixed: 0 },
        credito_avista: { percent: 0, fixed: 0 },
        credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
      },
      bankAccounts: [],
      plans: []
    };
    const checklist = [
      { id: 'academy_info', title: 'Atualizar dados da academia', done: false },
      { id: 'ui_labels', title: 'Definir r\u00f3tulos (Aulas/Alunos/Leads)', done: false },
      { id: 'quick_times', title: 'Adicionar hor\u00e1rios r\u00e1pidos', done: false },
      { id: 'first_lead', title: 'Criar primeiro lead', done: false },
      { id: 'install_pwa', title: 'Instalar atalho no celular', done: false }
    ];
    const aiName = String(body.ai_name || '').trim().slice(0, 80);
    if (!aiName) {
      return res.status(400).json({ sucesso: false, erro: 'ai_name \u00e9 obrigat\u00f3rio' });
    }
    const nowIso = new Date().toISOString();
    const payload = {
      name: me.name || '',
      phone: String(body.phone || '').trim(),
      owner_phone: String(body.owner_phone || body.phone || '').trim(),
      email: me.email || '',
      address: '',
      ownerId,
      teamId: '',
      uiLabels: JSON.stringify({ leads: 'Leads', students: 'Alunos', classes: 'Aulas' }),
      modules: JSON.stringify({ sales: false, inventory: false, finance: false }),
      quickTimes: [],
      financeConfig: JSON.stringify(defaultFinance),
      onboardingChecklist: JSON.stringify(checklist),
      customLeadQuestions: JSON.stringify(['\u0046aixa']),
      ai_name: aiName,
      plan: 'starter',
      plan_started_at: nowIso,
      ai_threads_limit: 300,
      ai_threads_used: 0,
      ai_overage_enabled: true,
      billing_cycle_day: 1,
      notified_80pct: false,
      notified_100pct: false,
      notified_trial_d3: false,
      notified_trial_d1: false,
      notified_trial_expired: false
    };
    const teamId = await createTeamForOwner().catch(() => '');
    payload.teamId = teamId || '';
    const perms = permsFor(teamId);
    const doc = await createAcademyDocumentResilient(databases, payload, perms);
    await maybeEnsureTrial(doc.$id);
    return res.status(200).json({ sucesso: true, id: doc.$id, teamId: teamId || '' });
  } catch (err) {
    console.error('[academies/create] erro:', {
      message: err?.message,
      code: err?.code,
      type: err?.type,
      stack: typeof err?.stack === 'string' ? err.stack.slice(0, 500) : undefined,
    });
    return res.status(500).json({ sucesso: false, erro: err?.message || 'Erro interno' });
  }
}
