import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
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
const LABELS_COL =
  process.env.VITE_APPWRITE_LABELS_COLLECTION_ID || process.env.APPWRITE_LABELS_COLLECTION_ID || '';
const LEADS_COL =
  process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function isValidHex(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(color || ''));
}

function json(res, status, obj) {
  res.status(status).json(obj);
}

function isNotFoundError(err) {
  const code = String(err?.code || '').trim();
  const type = String(err?.type || '').trim().toLowerCase();
  const msg = String(err?.message || '').toLowerCase();
  return code === '404' || type.includes('not_found') || msg.includes('document with the requested id could not be found');
}

function labelIdFromRequest(req) {
  const q = String(req.query?.id || '').trim();
  if (q) return q;
  const url = String(req.url || '');
  const m = url.match(/\/api\/labels\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    if (!LABELS_COL || !DB_ID) {
      return json(res, 200, { sucesso: true, labels: [] });
    }
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    try {
      if (!DB_ID || !LABELS_COL) {
        console.error('[api/labels] Erro de configuração:', { DB_ID, LABELS_COL });
        return json(res, 500, { sucesso: false, erro: 'Configuração Appwrite ausente no servidor (DB_ID ou LABELS_COL)' });
      }

      const existing = await databases.listDocuments(DB_ID, LABELS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.limit(200),
      ]);

      const sorted = [...existing.documents].sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')
      );
      return json(res, 200, { sucesso: true, labels: sorted });
    } catch (e) {
      console.error('[api/labels] Erro ao listar etiquetas:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar etiquetas' });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (method === 'POST') {
    if (!LABELS_COL || !DB_ID) {
      return json(res, 503, { sucesso: false, erro: 'Coleção de etiquetas não configurada no servidor' });
    }
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const name = String(req.body?.name || '').trim();
    const color = String(req.body?.color || '').trim();

    if (!name) return json(res, 400, { sucesso: false, erro: 'nome é obrigatório' });
    if (!color) return json(res, 400, { sucesso: false, erro: 'cor é obrigatória' });
    if (name.length > 30) return json(res, 400, { sucesso: false, erro: 'nome deve ter no máximo 30 caracteres' });
    if (!isValidHex(color)) return json(res, 400, { sucesso: false, erro: 'cor inválida — use formato hex #RRGGBB' });

    try {
      const doc = await databases.createDocument(
        DB_ID,
        LABELS_COL,
        ID.unique(),
        { academy_id: academyId, name, color, is_system: false },
        [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
      );
      return json(res, 201, { sucesso: true, label: doc });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar etiqueta' });
    }
  }

  // ── PATCH ───────────────────────────────────────────────────────────────────
  if (method === 'PATCH') {
    if (!LABELS_COL || !DB_ID) {
      return json(res, 503, { sucesso: false, erro: 'Coleção de etiquetas não configurada no servidor' });
    }
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const id = labelIdFromRequest(req);
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });

    try {
      const existing = await databases.getDocument(DB_ID, LABELS_COL, id);
      if (String(existing?.academy_id || '') !== academyId)
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });

      const updates = {};
      if (req.body?.name !== undefined) {
        const name = String(req.body.name || '').trim();
        if (!name) return json(res, 400, { sucesso: false, erro: 'nome é obrigatório' });
        if (name.length > 30) return json(res, 400, { sucesso: false, erro: 'nome deve ter no máximo 30 caracteres' });
        updates.name = name;
      }
      if (req.body?.color !== undefined) {
        const color = String(req.body.color || '').trim();
        if (!isValidHex(color)) return json(res, 400, { sucesso: false, erro: 'cor inválida — use formato hex #RRGGBB' });
        updates.color = color;
      }

      const updated = await databases.updateDocument(DB_ID, LABELS_COL, id, updates);
      return json(res, 200, { sucesso: true, label: updated });
    } catch (e) {
      if (isNotFoundError(e)) {
        return json(res, 404, { sucesso: false, erro: 'Etiqueta não encontrada' });
      }
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao editar etiqueta' });
    }
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    if (!LABELS_COL || !DB_ID) {
      return json(res, 503, { sucesso: false, erro: 'Coleção de etiquetas não configurada no servidor' });
    }
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const id = labelIdFromRequest(req);
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });

    try {
      const existing = await databases.getDocument(DB_ID, LABELS_COL, id);
      if (String(existing?.academy_id || '') !== academyId)
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });

      if (LEADS_COL) {
        try {
          let offset = 0;
          while (true) {
            const batch = await databases.listDocuments(DB_ID, LEADS_COL, [
              Query.equal('academyId', [academyId]),
              Query.limit(100),
              Query.offset(offset),
            ]);
            if (!batch.documents.length) break;
            const affected = batch.documents.filter(
              (l) => Array.isArray(l.label_ids) && l.label_ids.includes(id)
            );
            for (const lead of affected) {
              await databases.updateDocument(DB_ID, LEADS_COL, lead.$id, {
                label_ids: lead.label_ids.filter((x) => x !== id),
              });
            }
            if (batch.documents.length < 100) break;
            offset += 100;
          }
        } catch {
          void 0;
        }
      }

      await databases.deleteDocument(DB_ID, LABELS_COL, id);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      if (isNotFoundError(e)) {
        return json(res, 404, { sucesso: false, erro: 'Etiqueta não encontrada' });
      }
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao deletar etiqueta' });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
