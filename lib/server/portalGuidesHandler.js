import { Query } from 'node-appwrite';
import { ensureAuth, databases } from './academyAccess.js';
import { DB_ID, ACADEMY_PORTAL_GUIDES_COL } from './appwriteCollections.js';
import {
  listActivePortalAccessForUser,
  PORTAL_FORBIDDEN,
} from './portalAccess.js';
import { filterPublishedGuides, normalizeGuideSlug } from './portalGuidesCore.js';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function mapGuideListItem(doc) {
  return {
    id: doc.$id,
    title: doc.title || '',
    slug: doc.slug || '',
    summary: doc.summary || '',
    category: doc.category || 'geral',
    sort_order: Number(doc.sort_order) || 0,
  };
}

function mapGuideDetail(doc) {
  return {
    ...mapGuideListItem(doc),
    body_markdown: doc.body_markdown || '',
    attachments_json: doc.attachments_json || '[]',
  };
}

async function resolvePortalAcademyId(authUserId, studentId, academyIdHint) {
  const rows = await listActivePortalAccessForUser(databases, authUserId);
  if (!rows.length) {
    const err = new Error(PORTAL_FORBIDDEN);
    err.code = PORTAL_FORBIDDEN;
    throw err;
  }
  const sid = String(studentId || '').trim();
  const aidHint = String(academyIdHint || '').trim();
  if (sid) {
    const row = rows.find((r) => String(r.student_id) === sid);
    if (row) return String(row.academy_id);
  }
  if (aidHint && rows.some((r) => String(r.academy_id) === aidHint)) return aidHint;
  return String(rows[0].academy_id);
}

export default async function portalGuidesHandler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end();
    return null;
  }

  const me = await ensureAuth(req, res);
  if (!me) return null;

  if (!ACADEMY_PORTAL_GUIDES_COL) {
    return json(res, 500, { sucesso: false, erro: 'portal_guides_not_configured' });
  }

  try {
    const studentId = String(req.query?.student_id || '').trim();
    const academyId = await resolvePortalAcademyId(
      me.$id,
      studentId,
      req.query?.academy_id
    );
    const slug = normalizeGuideSlug(req.query?.slug);

    const queries = [
      Query.equal('academy_id', academyId),
      Query.equal('published', true),
      Query.orderAsc('sort_order'),
      Query.limit(100),
    ];

    const list = await databases.listDocuments(DB_ID, ACADEMY_PORTAL_GUIDES_COL, queries);
    const guides = filterPublishedGuides(list.documents || []);

    if (slug) {
      const detail = guides.find((g) => normalizeGuideSlug(g.slug) === slug);
      if (!detail) return json(res, 404, { sucesso: false, erro: 'guide_not_found' });
      return json(res, 200, { sucesso: true, guide: mapGuideDetail(detail), academy_id: academyId });
    }

    return json(res, 200, {
      sucesso: true,
      guides: guides.map(mapGuideListItem),
      academy_id: academyId,
    });
  } catch (e) {
    if (e?.code === PORTAL_FORBIDDEN) {
      return json(res, 403, { sucesso: false, erro: 'forbidden' });
    }
    console.error('[portal-guides]', e?.message || e);
    return json(res, 500, { sucesso: false, erro: 'guides_failed' });
  }
}
