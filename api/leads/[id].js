import { Client, Databases, Query, Account, Teams } from 'node-appwrite';
import { sendZapsterText } from '../../lib/server/zapsterSend.js';

/**
 * Cron externo (ex.: cron-job.org):
 * Confirmação experimental:
 *   GET …/api/leads/cron-confirmacao — header x-cron-secret: <CRON_SECRET>
 *   Horário sugerido: 21:00 UTC (18:00 America/Sao_Paulo), diariamente.
 * Aniversário (alunos Matriculado + birthDate):
 *   GET …/api/leads/cron-aniversario — mesmo header/secret; diário (ex.: manhã SP).
 */

const CRON_TZ = 'America/Sao_Paulo';
const LEAD_STATUS_SCHEDULED = 'Agendado';
const LEAD_STATUS_MATRICULADO = 'Matriculado';

function addOneCalendarDayYMD(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return ymd;
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

/** Amanhã (data civil) no fuso informado, no formato YYYY-MM-DD (igual scheduledDate). */
function tomorrowYMDInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const mo = parts.find((p) => p.type === 'month')?.value;
  const da = parts.find((p) => p.type === 'day')?.value;
  const todayYMD = `${y}-${mo}-${da}`;
  return addOneCalendarDayYMD(todayYMD);
}

/** MM-DD (zero-padded) no calendário civil de `timeZone`, alinhado a birthDate YYYY-MM-DD (slice 5). */
function monthDayMMDDInTimeZone(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const mo = parts.find((p) => p.type === 'month')?.value;
  const da = parts.find((p) => p.type === 'day')?.value;
  return `${mo}-${da}`;
}

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-academy-id, x-cron-secret');
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

  // ── CRON: confirmação automática de experimental ──────────────────
  if (req.method === 'GET' && id === 'cron-confirmacao') {
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const dataAmanha = tomorrowYMDInTimeZone(CRON_TZ);
    console.log('[cron-confirmacao] iniciando', { dataAmanha, tz: CRON_TZ });

    try {
      const result = await databases.listDocuments(DB_ID, LEADS_COL, [
        Query.equal('scheduledDate', dataAmanha),
        Query.equal('status', [LEAD_STATUS_SCHEDULED]),
        Query.limit(100),
      ]);

      const leads = Array.isArray(result?.documents) ? result.documents : [];
      const resultados = [];

      for (const lead of leads) {
        try {
          const aid = String(lead?.academyId || '').trim();
          if (!aid) {
            resultados.push({
              id: lead.$id,
              name: lead.name,
              status: 'sem_academyId',
            });
            continue;
          }

          const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);

          if (academyDoc?.ia_ativa !== true) {
            resultados.push({
              id: lead.$id,
              name: lead.name,
              status: 'ia_inativa',
            });
            continue;
          }

          const instanceId = String(
            academyDoc?.zapsterInstanceId || academyDoc?.zapster_instance_id || ''
          ).trim();
          if (!instanceId) {
            resultados.push({
              id: lead.$id,
              name: lead.name,
              status: 'sem_instancia',
            });
            continue;
          }

          const nome = lead.name?.split(' ')[0] || 'você';
          const hora = lead.scheduledTime || '';
          const horaTexto = hora ? ` às ${hora}` : '';

          const mensagem =
            `Oi ${nome}! 😊 Passando para confirmar sua aula experimental` +
            `${horaTexto} amanhã.\n\n` +
            `Está tudo certo para você? Qualquer dúvida é só falar!`;

          const sent = await sendZapsterText({
            recipient: lead.phone,
            text: mensagem,
            instanceId,
          });

          resultados.push({
            id: lead.$id,
            name: lead.name,
            phone: lead.phone,
            status: sent?.ok ? 'enviado' : 'erro_zapster',
            erro: sent?.ok ? null : sent?.erro,
          });
        } catch (e) {
          resultados.push({
            id: lead.$id,
            name: lead.name,
            status: 'erro',
            erro: e?.message || String(e),
          });
        }
      }

      const enviados = resultados.filter((r) => r.status === 'enviado').length;
      const erros = resultados.filter(
        (r) => r.status === 'erro' || r.status === 'erro_zapster'
      ).length;

      console.log('[cron-confirmacao] concluído', {
        dataAmanha,
        total: leads.length,
        enviados,
        erros,
      });

      return res.status(200).json({
        sucesso: true,
        dataAmanha,
        total: leads.length,
        enviados,
        erros,
        resultados,
      });
    } catch (e) {
      console.error('[cron-confirmacao] erro geral', { erro: e?.message || e });
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }

  if (req.method === 'GET' && id === 'cron-aniversario') {
    const cronSecret = req.headers['x-cron-secret'] || req.query.secret;
    if (!cronSecret || cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const mesEDia = monthDayMMDDInTimeZone(CRON_TZ);
    console.log('[cron-aniversario] iniciando', { mesEDia, tz: CRON_TZ });

    try {
      const candidatos = [];
      let cursor = null;
      const pageSize = 100;
      for (;;) {
        const q = [
          Query.equal('status', [LEAD_STATUS_MATRICULADO]),
          Query.orderAsc('$id'),
          Query.limit(pageSize),
        ];
        if (cursor) q.push(Query.cursorAfter(cursor));
        const batch = await databases.listDocuments(DB_ID, LEADS_COL, q);
        const docs = Array.isArray(batch?.documents) ? batch.documents : [];
        candidatos.push(...docs);
        if (docs.length < pageSize) break;
        cursor = docs[docs.length - 1].$id;
      }

      const aniversariantes = candidatos.filter((lead) => {
        let bd = String(lead.birthDate || '').trim();
        if (!bd && lead.notes) {
          try {
            const parsed = JSON.parse(lead.notes);
            bd = String(parsed.birthDate || '').trim();
          } catch { bd = ''; }
        }
        return bd.length === 10 && bd.slice(5) === mesEDia;
      });

      const resultados = [];

      for (const lead of aniversariantes) {
        try {
          const aid = String(lead?.academyId || '').trim();
          if (!aid) {
            resultados.push({ id: lead.$id, name: lead.name, status: 'sem_academyId' });
            continue;
          }

          const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, aid);

          if (academyDoc?.ia_ativa !== true) {
            resultados.push({ id: lead.$id, name: lead.name, status: 'ia_inativa' });
            continue;
          }

          const instanceId = String(
            academyDoc?.zapsterInstanceId || academyDoc?.zapster_instance_id || ''
          ).trim();
          if (!instanceId) {
            resultados.push({ id: lead.$id, name: lead.name, status: 'sem_instancia' });
            continue;
          }

          const mensagemTemplate = String(academyDoc?.birthdayMessage || '').trim();
          if (!mensagemTemplate) {
            resultados.push({ id: lead.$id, name: lead.name, status: 'sem_mensagem_configurada' });
            continue;
          }

          const phone = String(lead.phone || '').trim();
          if (!phone) {
            resultados.push({ id: lead.$id, name: lead.name, status: 'sem_telefone' });
            continue;
          }

          const nome = lead.name?.split(' ')[0] || 'você';
          const mensagem = mensagemTemplate.replace(/\{nome\}/gi, nome);

          const sent = await sendZapsterText({
            recipient: phone,
            text: mensagem,
            instanceId,
          });

          resultados.push({
            id: lead.$id,
            name: lead.name,
            phone,
            status: sent?.ok ? 'enviado' : 'erro_zapster',
            erro: sent?.ok ? null : sent?.erro,
          });
        } catch (e) {
          resultados.push({
            id: lead.$id,
            name: lead.name,
            status: 'erro',
            erro: e?.message || String(e),
          });
        }
      }

      const enviados = resultados.filter((r) => r.status === 'enviado').length;
      console.log('[cron-aniversario] concluído', {
        mesEDia,
        candidatos: candidatos.length,
        aniversariantes: aniversariantes.length,
        enviados,
      });

      return res.status(200).json({
        sucesso: true,
        mesEDia,
        total: aniversariantes.length,
        resultados,
      });
    } catch (e) {
      console.error('[cron-aniversario] erro geral', { erro: e?.message || e });
      return res.status(500).json({ sucesso: false, erro: e?.message || 'Erro interno' });
    }
  }
  // ── fim CRON ─────────────────────────────────────────────────────

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
