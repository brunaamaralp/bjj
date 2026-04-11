import { Client, Databases, Query, Account, Teams } from 'node-appwrite';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForServer } from '../lib/constants.js';
import { safeParseMessages, getOrCreateConversationDoc } from '../lib/server/conversationsStore.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';
const ACADEMIES_COL = process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);
const teams = new Teams(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

function ensureConfig() {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL || !ACADEMIES_COL) {
    return false;
  }
  return true;
}

async function ensureAuth(req) {
  const auth = String(req.headers.get('authorization') || '');
  if (!auth.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const jwt = auth.slice(7).trim();
  if (!jwt) {
    return null;
  }
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setJWT(jwt);
    const account = new Account(userClient);
    return await account.get();
  } catch {
    return null;
  }
}

function resolveAcademyHeader(req) {
  return String(req.headers.get('x-academy-id') || '').trim();
}

async function ensureAcademyAccess(req, me) {
  const academyId = resolveAcademyHeader(req);
  if (!academyId) {
    return null;
  }
  try {
    const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
    const ownerId = String(doc?.ownerId || '').trim();
    const userId = String(me?.$id || '').trim();
    if (ownerId && userId && ownerId === userId) return { academyId, doc };

    const teamId = String(doc?.teamId || '').trim();
    if (teamId && userId) {
      try {
        const memberships = await teams.listMemberships(teamId, [Query.equal('userId', [userId]), Query.limit(1)]);
        const list = Array.isArray(memberships?.memberships) ? memberships.memberships : [];
        if (list.length > 0) return { academyId, doc };
      } catch {
        void 0;
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

function sortMessagesChrono(msgs) {
  const arr = Array.isArray(msgs) ? msgs.slice() : [];
  return arr.sort((a, b) => {
    const ta = new Date(String(a?.timestamp || '')).getTime();
    const tb = new Date(String(b?.timestamp || '')).getTime();
    const na = Number.isFinite(ta) ? ta : 0;
    const nb = Number.isFinite(tb) ? tb : 0;
    if (na !== nb) return na - nb;
    return 0;
  });
}

function lastMessageMeta(msgs) {
  const arr = sortMessagesChrono(msgs);
  if (arr.length === 0) {
    return {
      last_preview: '',
      last_message_role: '',
      last_message_sender: '',
      last_message_timestamp: ''
    };
  }
  const last = arr[arr.length - 1];
  const content = String(last?.content || '').trim();
  const preview = content.replace(/_{2,}/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    last_preview: preview,
    last_message_role: last?.role === 'assistant' ? 'assistant' : 'user',
    last_message_sender: String(last?.sender || '').trim() || (last?.role === 'assistant' ? 'ai' : ''),
    last_message_timestamp: String(last?.timestamp || '').trim()
  };
}

function parseSummaryField(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' ? o : null;
  } catch {
    return null;
  }
}

function docToListItem(doc) {
  const msgs = safeParseMessages(doc.messages);
  const meta = lastMessageMeta(msgs);
  const unread = Number.isFinite(Number(doc.unread_count)) ? Number(doc.unread_count) : 0;
  const updatedAt = String(doc.updated_at || doc.$updatedAt || '').trim();
  return {
    id: doc.$id,
    phone_number: String(doc.phone_number || '').trim(),
    updated_at: updatedAt,
    unread_count: unread,
    need_human: humanHandoffIsActive(doc.human_handoff_until),
    human_handoff_until: typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '',
    ticket_status: String(doc.ticket_status || 'open').trim() || 'open',
    transfer_to: String(doc.transfer_to || '').trim(),
    lead_id: String(doc.lead_id || '').trim(),
    lead_name: String(doc.lead_name || '').trim(),
    contact_name: String(doc.contact_name || '').trim(),
    last_read_at: String(doc.last_read_at || '').trim(),
    last_user_msg_at: String(doc.last_user_msg_at || '').trim(),
    ...meta,
    last_message_timestamp: meta.last_message_timestamp || updatedAt
  };
}

function matchesSearch(doc, searchRaw) {
  const raw = String(searchRaw || '').trim();
  if (!raw) return true;
  const q = raw.toLowerCase();
  const phoneDigits = String(doc.phone_number || '').replace(/\D/g, '');
  const qDigits = raw.replace(/\D/g, '');
  if (qDigits.length >= 2 && phoneDigits.includes(qDigits)) return true;
  const name = `${String(doc.lead_name || '')} ${String(doc.contact_name || '')}`.toLowerCase();
  return name.includes(q);
}

async function findConversationDoc(academyId, phoneDigits) {
  const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [academyId]),
    Query.equal('phone_number', [phoneDigits]),
    Query.limit(1)
  ]);
  return list.documents?.[0] || null;
}

function ensureJsonBody(req, res) {
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

export const config = {
  runtime: 'edge',
};

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (!ensureConfig()) return jsonResponse({ sucesso: false, erro: 'Configuração Appwrite ausente' }, 500);

  const me = await ensureAuth(req);
  if (!me) return jsonResponse({ sucesso: false, erro: 'Não autorizado' }, 401);

  const access = await ensureAcademyAccess(req, me);
  if (!access) return jsonResponse({ sucesso: false, erro: 'Acesso negado à academia' }, 403);
  const { academyId, doc: academyDoc } = access;

  const url = new URL(req.url);
  const phoneParam = url.searchParams.get('phone') || url.searchParams.get('slug');
  const phoneRaw = phoneParam != null ? String(phoneParam).trim() : '';
  const phoneDigits = normalizePhone(phoneRaw);

  /** Lista: GET /api/conversations */
  if (!phoneDigits) {
    if (req.method !== 'GET') {
      return new Response(JSON.stringify({ sucesso: false, erro: 'Método não permitido' }), { status: 405, headers: { Allow: 'GET', 'content-type': 'application/json' } });
    }

    const limit = Math.min(100, Math.max(1, parseInt(String(url.searchParams.get('limit') || '50'), 10) || 50));
    const cursor = String(url.searchParams.get('cursor') || '').trim();
    const search = String(url.searchParams.get('search') || '').trim();
    const searchDigits = normalizePhone(search);

    const queries = [Query.equal('academy_id', [academyId]), Query.orderDesc('updated_at'), Query.limit(limit + 1)];
    if (searchDigits.length >= 2) {
      queries.splice(1, 0, Query.startsWith('phone_number', searchDigits));
    }
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    try {
      const list = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, queries);
      let docs = list.documents || [];

      if (search.trim() && !searchDigits) {
        const wide = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
          Query.equal('academy_id', [academyId]),
          Query.orderDesc('updated_at'),
          Query.limit(120)
        ]);
        docs = (wide.documents || []).filter((d) => matchesSearch(d, search));
        const page = docs.slice(0, limit);
        return json(res, 200, {
          items: page.map(docToListItem),
          next_cursor: null
        });
      }

      const hasMore = docs.length > limit;
      const page = hasMore ? docs.slice(0, limit) : docs;
      const next_cursor = hasMore && page.length > 0 ? String(page[page.length - 1].$id) : null;
      return jsonResponse({ items: page.map(docToListItem), next_cursor }, 200);
    } catch (e) {
      return jsonResponse({ sucesso: false, erro: e?.message || 'Erro ao listar conversas' }, 500);
    }
  }

  /** Thread + ações: /api/conversations/:phone */
  if (req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(String(url.searchParams.get('limit') || '50'), 10) || 50));
    const cursor = String(url.searchParams.get('cursor') || '').trim();

    try {
      const doc = await findConversationDoc(academyId, phoneDigits);
      if (!doc) {
        return jsonResponse({
          phone: phoneDigits,
          messages: [],
          next_cursor: '',
          summary: null,
          lead_id: null,
          lead_name: '',
          need_human: false,
          human_handoff_until: '',
          ticket_status: 'open',
          transfer_to: ''
        }, 200);
      }

      const sorted = sortMessagesChrono(safeParseMessages(doc.messages));
      const len = sorted.length;
      let slice;
      let next_cursor = '';

      if (!cursor) {
        const startIdx = Math.max(0, len - limit);
        slice = sorted.slice(startIdx);
        next_cursor = startIdx > 0 ? String(startIdx) : '';
      } else {
        const startIdx = parseInt(cursor, 10);
        if (!Number.isFinite(startIdx) || startIdx <= 0) {
          const s = Math.max(0, len - limit);
          slice = sorted.slice(s);
          next_cursor = s > 0 ? String(s) : '';
        } else {
          const from = Math.max(0, startIdx - limit);
          slice = sorted.slice(from, startIdx);
          next_cursor = from > 0 ? String(from) : '';
        }
      }

      return jsonResponse({
        phone: phoneDigits,
        messages: slice,
        next_cursor,
        summary: parseSummaryField(doc.summary),
        lead_id: String(doc.lead_id || '').trim() || null,
        lead_name: String(doc.lead_name || '').trim(),
        need_human: humanHandoffIsActive(doc.human_handoff_until),
        human_handoff_until: typeof doc.human_handoff_until === 'string' ? doc.human_handoff_until : '',
        ticket_status: String(doc.ticket_status || 'open').trim() || 'open',
        transfer_to: String(doc.transfer_to || '').trim(),
        unread_count: Number.isFinite(Number(doc.unread_count)) ? Number(doc.unread_count) : 0
      }, 200);
    } catch (e) {
      return jsonResponse({ sucesso: false, erro: e?.message || 'Erro ao carregar conversa' }, 500);
    }
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ sucesso: false, erro: 'Método não permitido' }), { status: 405, headers: { Allow: 'GET, POST', 'content-type': 'application/json' } });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();

  try {
    let doc = await findConversationDoc(academyId, phoneDigits);

    if (action === 'read') {
      if (!doc) return jsonResponse({ ok: true, unread_count: 0 }, 200);
      const nowIso = new Date().toISOString();
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0, last_read_at: nowIso });
      } catch {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0 });
      }
      return jsonResponse({ ok: true, unread_count: 0, last_read_at: nowIso }, 200);
    }

    if (action === 'handoff') {
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return jsonResponse({ sucesso: false, erro: 'Não foi possível abrir conversa' }, 500);

      const ativo = Boolean(body.ativo);
      let until = '';
      if (ativo) {
        const h = getHumanHandoffHoursForServer();
        until = humanHandoffUntilFromMs(Date.now() + h * 3600000) || '';
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { human_handoff_until: until });
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return jsonResponse({
        need_human: humanHandoffIsActive(updated.human_handoff_until),
        human_handoff_until: String(updated.human_handoff_until || '')
      }, 200);
    }

    if (action === 'link_lead') {
      const leadId = String(body.lead_id || '').trim();
      if (!leadId) return jsonResponse({ sucesso: false, erro: 'lead_id ausente' }, 400);
      if (!LEADS_COL) return jsonResponse({ sucesso: false, erro: 'LEADS_COL não configurado' }, 500);
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return jsonResponse({ sucesso: false, erro: 'Não foi possível abrir conversa' }, 500);

      const lead = await databases.getDocument(DB_ID, LEADS_COL, leadId);
      const leadAcademy = String(lead?.academyId || lead?.academy_id || '').trim();
      if (leadAcademy && leadAcademy !== academyId) {
        return jsonResponse({ sucesso: false, erro: 'Lead de outra academia' }, 403);
      }
      const leadName = String(lead?.name || '').trim();
      const payload = { lead_id: leadId };
      if (leadName) payload.lead_name = leadName;
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      return jsonResponse({ lead_id: leadId, lead_name: leadName }, 200);
    }

    if (action === 'ticket') {
      const status = String(body.status || '').trim();
      if (!status) return jsonResponse({ sucesso: false, erro: 'status ausente' }, 400);
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return jsonResponse({ sucesso: false, erro: 'Não foi possível abrir conversa' }, 500);

      const transferTo = body.transfer_to != null ? String(body.transfer_to).trim() : '';
      const payload = { ticket_status: status };
      if (transferTo) payload.transfer_to = transferTo;
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      } catch (e) {
        return jsonResponse({ sucesso: false, erro: e?.message || 'Erro ao atualizar ticket' }, 500);
      }
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return jsonResponse({
        ticket_status: String(updated.ticket_status || status),
        transfer_to: String(updated.transfer_to || '')
      }, 200);
    }

    return jsonResponse({ sucesso: false, erro: 'action inválida' }, 400);
  } catch (e) {
    return jsonResponse({ sucesso: false, erro: e?.message || 'Erro interno' }, 500);
  }
}
