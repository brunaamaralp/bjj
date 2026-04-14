import { Client, Databases, Query, ID, Permission, Role } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './_lib/academyAccess.js';

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

const SYSTEM_LABELS = [
  { name: 'Interessado', color: '#5B3FBF' },
  { name: 'VIP', color: '#F5A623' },
  { name: 'Sem resposta', color: '#8E8E8E' },
  { name: 'Problema', color: '#F04040' },
];

function isValidHex(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(color || ''));
}

function json(res, status, obj) {
  res.status(status).json(obj);
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();

  if (!LABELS_COL) {
    return json(res, 500, { sucesso: false, erro: 'LABELS_COL não configurada no servidor' });
  }

  // ── GET ─────────────────────────────────────────────────────────────────────
  if (method === 'GET') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    try {
      const existing = await databases.listDocuments(DB_ID, LABELS_COL, [
        Query.equal('academy_id', [academyId]),
        Query.limit(200),
      ]);

      // Auto-seed system labels on first access
      if (existing.total === 0) {
        const seeded = [];
        for (const sl of SYSTEM_LABELS) {
          const doc = await databases.createDocument(
            DB_ID,
            LABELS_COL,
            ID.unique(),
            { academy_id: academyId, name: sl.name, color: sl.color, is_system: true },
            [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
          );
          seeded.push(doc);
        }
        return json(res, 200, { sucesso: true, labels: seeded });
      }

      const sorted = [...existing.documents].sort((a, b) => {
        if (a.is_system && !b.is_system) return -1;
        if (!a.is_system && b.is_system) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR');
      });
      return json(res, 200, { sucesso: true, labels: sorted });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar etiquetas' });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────────
  if (method === 'POST') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const name = String(req.body?.name || '').trim();
    const color = String(req.body?.color || '#8E8E8E').trim();

    if (!name) return json(res, 400, { sucesso: false, erro: 'nome é obrigatório' });
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

  // ── PATCH /:id ───────────────────────────────────────────────────────────────
  if (method === 'PATCH') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const id = String(req.query?.id || '').trim();
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });

    try {
      const existing = await databases.getDocument(DB_ID, LABELS_COL, id);
      if (String(existing?.academy_id || '') !== academyId)
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
      if (existing?.is_system)
        return json(res, 403, { sucesso: false, erro: 'Etiquetas do sistema não podem ser editadas' });

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
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao editar etiqueta' });
    }
  }

  // ── DELETE /:id ──────────────────────────────────────────────────────────────
  if (method === 'DELETE') {
    const me = await ensureAuth(req, res);
    if (!me) return;
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { academyId } = access;

    const id = String(req.query?.id || '').trim();
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });

    try {
      const existing = await databases.getDocument(DB_ID, LABELS_COL, id);
      if (String(existing?.academy_id || '') !== academyId)
        return json(res, 403, { sucesso: false, erro: 'Acesso negado' });
      if (existing?.is_system)
        return json(res, 403, { sucesso: false, erro: 'Etiquetas do sistema não podem ser deletadas' });

      // Remove label_id from all leads that reference it
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
          // Cleanup failure should not block the label deletion
        }
      }

      await databases.deleteDocument(DB_ID, LABELS_COL, id);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao deletar etiqueta' });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
