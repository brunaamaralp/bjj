import { Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, databases, isAcademyOwnerOrAdminUser } from './academyAccess.js';
import { DB_ID, ACADEMY_PORTAL_GUIDES_COL } from './appwriteCollections.js';
import {
  slugifyGuideTitle,
  normalizeGuideSlug,
  validateGuideBody,
  validateGuideTitle,
  GUIDE_CATEGORIES,
} from './portalGuidesCore.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return {};
}

function mapGuide(doc) {
  return {
    id: doc.$id,
    title: doc.title || '',
    slug: doc.slug || '',
    summary: String(doc.summary || '').slice(0, 160),
    body_markdown: doc.body_markdown || '',
    category: doc.category || 'geral',
    sort_order: Number(doc.sort_order) || 0,
    published: doc.published === true,
    attachments_json: doc.attachments_json || '[]',
    created_by_user_id: doc.created_by_user_id || '',
  };
}

async function assertGuidesAdmin(req, res, me) {
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return null;
  const isAdmin = await isAcademyOwnerOrAdminUser(access.doc, me);
  if (!isAdmin) {
    json(res, 403, { sucesso: false, erro: 'admin_required' });
    return null;
  }
  return access;
}

async function ensureUniqueSlug(academyId, slug, excludeId = '') {
  const list = await databases.listDocuments(DB_ID, ACADEMY_PORTAL_GUIDES_COL, [
    Query.equal('academy_id', academyId),
    Query.equal('slug', slug),
    Query.limit(5),
  ]);
  const conflict = (list.documents || []).find((d) => d.$id !== excludeId);
  if (conflict) {
    const err = new Error('slug_conflict');
    err.code = 'slug_conflict';
    throw err;
  }
}

export default async function portalGuidesManageHandler(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return null;

  if (!ACADEMY_PORTAL_GUIDES_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_guides_not_configured' });
  }

  const access = await assertGuidesAdmin(req, res, me);
  if (!access) return null;
  const { academyId } = access;

  if (req.method === 'GET') {
    try {
      const list = await databases.listDocuments(DB_ID, ACADEMY_PORTAL_GUIDES_COL, [
        Query.equal('academy_id', academyId),
        Query.orderAsc('sort_order'),
        Query.limit(100),
      ]);
      return json(res, 200, {
        sucesso: true,
        guides: (list.documents || []).map(mapGuide),
      });
    } catch (e) {
      console.error('[portal-guides-manage GET]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'list_failed' });
    }
  }

  if (req.method === 'POST') {
    const body = await readBody(req);
    const titleCheck = validateGuideTitle(body.title);
    if (!titleCheck.ok) return json(res, 400, { sucesso: false, erro: titleCheck.erro });
    const bodyCheck = validateGuideBody(body.body_markdown);
    if (!bodyCheck.ok) return json(res, 400, { sucesso: false, erro: bodyCheck.erro });

    const slug = normalizeGuideSlug(body.slug) || slugifyGuideTitle(body.title);
    const category = GUIDE_CATEGORIES.includes(body.category) ? body.category : 'geral';

    try {
      await ensureUniqueSlug(academyId, slug);
      const list = await databases.listDocuments(DB_ID, ACADEMY_PORTAL_GUIDES_COL, [
        Query.equal('academy_id', academyId),
        Query.limit(1),
      ]);
      const sortOrder = Number(body.sort_order);
      const doc = await databases.createDocument(DB_ID, ACADEMY_PORTAL_GUIDES_COL, ID.unique(), {
        academy_id: academyId,
        title: String(body.title).trim().slice(0, 256),
        slug,
        summary: String(body.summary || '').trim().slice(0, 160),
        body_markdown: String(body.body_markdown || '').slice(0, 24576),
        category,
        sort_order: Number.isFinite(sortOrder) ? Math.trunc(sortOrder) : (list.total || 0) + 1,
        published: body.published === true,
        attachments_json: String(body.attachments_json || '[]').slice(0, 8192),
        created_by_user_id: me.$id,
      });
      return json(res, 200, { sucesso: true, guide: mapGuide(doc) });
    } catch (e) {
      if (e?.code === 'slug_conflict') {
        return json(res, 409, { sucesso: false, erro: 'slug_conflict' });
      }
      console.error('[portal-guides-manage POST]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'create_failed' });
    }
  }

  if (req.method === 'PATCH') {
    const body = await readBody(req);
    const guideId = String(body.id || req.query?.id || '').trim();
    if (!guideId) return json(res, 400, { sucesso: false, erro: 'id_required' });

    try {
      const existing = await databases.getDocument(DB_ID, ACADEMY_PORTAL_GUIDES_COL, guideId);
      if (String(existing.academy_id) !== String(academyId)) {
        return json(res, 403, { sucesso: false, erro: 'forbidden' });
      }

      const patch = {};
      if (body.title != null) {
        const titleCheck = validateGuideTitle(body.title);
        if (!titleCheck.ok) return json(res, 400, { sucesso: false, erro: titleCheck.erro });
        patch.title = String(body.title).trim().slice(0, 256);
      }
      if (body.body_markdown != null) {
        const bodyCheck = validateGuideBody(body.body_markdown);
        if (!bodyCheck.ok) return json(res, 400, { sucesso: false, erro: bodyCheck.erro });
        patch.body_markdown = String(body.body_markdown).slice(0, 24576);
      }
      if (body.summary != null) patch.summary = String(body.summary).trim().slice(0, 160);
      if (body.category != null && GUIDE_CATEGORIES.includes(body.category)) patch.category = body.category;
      if (body.published != null) patch.published = body.published === true;
      if (body.sort_order != null && Number.isFinite(Number(body.sort_order))) {
        patch.sort_order = Math.trunc(Number(body.sort_order));
      }
      if (body.attachments_json != null) {
        patch.attachments_json = String(body.attachments_json).slice(0, 8192);
      }
      if (body.slug != null || body.title != null) {
        const slug = normalizeGuideSlug(body.slug) || slugifyGuideTitle(body.title || existing.title);
        await ensureUniqueSlug(academyId, slug, guideId);
        patch.slug = slug;
      }

      const doc = await databases.updateDocument(DB_ID, ACADEMY_PORTAL_GUIDES_COL, guideId, patch);
      return json(res, 200, { sucesso: true, guide: mapGuide(doc) });
    } catch (e) {
      if (e?.code === 'slug_conflict') {
        return json(res, 409, { sucesso: false, erro: 'slug_conflict' });
      }
      console.error('[portal-guides-manage PATCH]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'update_failed' });
    }
  }

  if (req.method === 'DELETE') {
    const body = await readBody(req);
    const guideId = String(body.id || req.query?.id || '').trim();
    if (!guideId) return json(res, 400, { sucesso: false, erro: 'id_required' });
    try {
      const existing = await databases.getDocument(DB_ID, ACADEMY_PORTAL_GUIDES_COL, guideId);
      if (String(existing.academy_id) !== String(academyId)) {
        return json(res, 403, { sucesso: false, erro: 'forbidden' });
      }
      await databases.deleteDocument(DB_ID, ACADEMY_PORTAL_GUIDES_COL, guideId);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      console.error('[portal-guides-manage DELETE]', e?.message || e);
      return json(res, 500, { sucesso: false, erro: 'delete_failed' });
    }
  }

  res.statusCode = 405;
  res.end();
  return null;
}
