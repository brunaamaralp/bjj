import { Client, Databases, Query, Account, Teams } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { humanHandoffIsActive, humanHandoffUntilFromMs } from '../lib/humanHandoffUntil.js';
import { getHumanHandoffHoursForServer } from '../lib/constants.js';
import { safeParseMessages, getOrCreateConversationDoc } from '../lib/server/conversationsStore.js';
import { assertBillingActive, sendBillingGateError } from '../lib/server/billingGate.js';
import conversationNotesHandler from '../lib/server/conversationNotesHandler.js';

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

function ensureConfig(res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !CONVERSATIONS_COL || !ACADEMIES_COL) {
    res.status(500).json({ sucesso: false, erro: 'Configuração Appwrite ausente' });
    return false;
  }
  return true;
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
    last_message_timestamp: meta.last_message_timestamp || updatedAt,
    archived: doc.archived === true
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

export default async function handler(req, res) {
  if (req.query.route === 'notes') return conversationNotesHandler(req, res);

  if (!ensureConfig(res)) return;

  const me = await ensureAuth(req, res);
  if (!me) return;

  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc: academyDoc } = access;

  try {
    await assertBillingActive(academyId);
  } catch (e) {
    if (sendBillingGateError(res, e)) return;
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
  }

  const phoneParam = req.query.phone || (Array.isArray(req.query.slug) ? req.query.slug[0] : req.query.slug);
  const phoneRaw = phoneParam != null ? String(phoneParam).trim() : '';
  const phoneDigits = normalizePhone(phoneRaw);

  /** Lista: GET /api/conversations */
  if (!phoneDigits) {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
    }

    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const cursor = String(req.query.cursor || '').trim();
    const search = String(req.query.search || '').trim();
    const searchDigits = normalizePhone(search);
    const archivedOnly =
      String(req.query.archived || '').trim() === '1' || String(req.query.archived || '').trim().toLowerCase() === 'true';

    const queries = [Query.equal('academy_id', [academyId])];
    if (archivedOnly) {
      queries.push(Query.equal('archived', [true]));
    } else {
      queries.push(Query.notEqual('archived', [true]));
    }
    queries.push(Query.orderDesc('updated_at'));
    queries.push(Query.limit(limit + 1));
    if (searchDigits.length >= 2) {
      queries.splice(2, 0, Query.startsWith('phone_number', searchDigits));
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
          archivedOnly ? Query.equal('archived', [true]) : Query.notEqual('archived', [true]),
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
      return json(res, 200, { items: page.map(docToListItem), next_cursor });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar conversas' });
    }
  }

  /** Thread + ações: /api/conversations/:phone */
  if (req.method === 'GET') {
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));
    const cursor = String(req.query.cursor || '').trim();

    try {
      const doc = await findConversationDoc(academyId, phoneDigits);
      if (!doc) {
        return json(res, 200, {
          phone: phoneDigits,
          conversation_id: null,
          archived: false,
          messages: [],
          next_cursor: '',
          summary: null,
          lead_id: null,
          lead_name: '',
          need_human: false,
          human_handoff_until: '',
          ticket_status: 'open',
          transfer_to: ''
        });
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

      return json(res, 200, {
        phone: phoneDigits,
        conversation_id: String(doc.$id || ''),
        archived: doc.archived === true,
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
      });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao carregar conversa' });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }

  if (!ensureJsonBody(req, res)) return;

  const body = req.body || {};
  const action = String(body.action || '').trim();

  try {
    let doc = await findConversationDoc(academyId, phoneDigits);

    if (action === 'read') {
      if (!doc) return json(res, 200, { ok: true, unread_count: 0 });
      const nowIso = new Date().toISOString();
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0, last_read_at: nowIso });
      } catch {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 0 });
      }
      return json(res, 200, { ok: true, unread_count: 0, last_read_at: nowIso });
    }

    if (action === 'unread') {
      if (!doc) return json(res, 404, { success: false, sucesso: false, erro: 'Conversa não encontrada' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { unread_count: 1 });
      return json(res, 200, { success: true });
    }

    if (action === 'archive') {
      if (!doc) return json(res, 404, { sucesso: false, erro: 'Conversa não encontrada' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { archived: true });
      return json(res, 200, { sucesso: true, archived: true });
    }

    if (action === 'unarchive') {
      if (!doc) return json(res, 404, { sucesso: false, erro: 'Conversa não encontrada' });
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { archived: false });
      return json(res, 200, { sucesso: true, archived: false });
    }

    if (action === 'handoff') {
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      const ativo = Boolean(body.ativo);
      let until = '';
      if (ativo) {
        const h = getHumanHandoffHoursForServer();
        until = humanHandoffUntilFromMs(Date.now() + h * 3600000) || '';
      }
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, { human_handoff_until: until });
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return json(res, 200, {
        need_human: humanHandoffIsActive(updated.human_handoff_until),
        human_handoff_until: String(updated.human_handoff_until || '')
      });
    }

    if (action === 'link_lead') {
      const leadId = String(body.lead_id || '').trim();
      if (!leadId) return json(res, 400, { sucesso: false, erro: 'lead_id ausente' });
      if (!LEADS_COL) return json(res, 500, { sucesso: false, erro: 'LEADS_COL não configurado' });
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      const lead = await databases.getDocument(DB_ID, LEADS_COL, leadId);
      const leadAcademy = String(lead?.academyId || lead?.academy_id || '').trim();
      if (leadAcademy && leadAcademy !== academyId) {
        return json(res, 403, { sucesso: false, erro: 'Lead de outra academia' });
      }
      const leadName = String(lead?.name || '').trim();
      const payload = { lead_id: leadId };
      if (leadName) payload.lead_name = leadName;
      await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      return json(res, 200, { lead_id: leadId, lead_name: leadName });
    }

    if (action === 'ticket') {
      const status = String(body.status || '').trim();
      if (!status) return json(res, 400, { sucesso: false, erro: 'status ausente' });
      if (!doc) {
        doc = await getOrCreateConversationDoc(phoneDigits, academyId, academyDoc);
      }
      if (!doc) return json(res, 500, { sucesso: false, erro: 'Não foi possível abrir conversa' });

      const transferTo = body.transfer_to != null ? String(body.transfer_to).trim() : '';
      const payload = { ticket_status: status };
      if (transferTo) payload.transfer_to = transferTo;
      try {
        await databases.updateDocument(DB_ID, CONVERSATIONS_COL, doc.$id, payload);
      } catch (e) {
        return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar ticket' });
      }
      const updated = await databases.getDocument(DB_ID, CONVERSATIONS_COL, doc.$id);
      return json(res, 200, {
        ticket_status: String(updated.ticket_status || status),
        transfer_to: String(updated.transfer_to || '')
      });
    }

    return json(res, 400, { sucesso: false, erro: 'action inválida' });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro interno' });
  }
}
