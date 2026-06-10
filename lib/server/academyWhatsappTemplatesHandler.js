import { apiErro, logApiError } from './friendlyError.js';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin, databases, DB_ID } from './academyAccess.js';
import {
  DEFAULT_WHATSAPP_TEMPLATES,
  WHATSAPP_TEMPLATE_KEYS,
  WHATSAPP_TEMPLATE_CHAR_LIMIT,
  parseWhatsappTemplatesField,
  serializeWhatsappTemplatesField,
  validateTemplatePlaceholders,
} from '../whatsappTemplateDefaults.js';

const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

function json(res, status, body) {
  return res.status(status).json(body);
}

function pickTemplatesPayload(body) {
  const src = body?.templates && typeof body.templates === 'object' ? body.templates : body;
  const out = {};
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    if (typeof src?.[key] === 'string') out[key] = String(src[key]);
  }
  return out;
}

function validateAllTemplates(templates) {
  const warnings = [];
  for (const key of WHATSAPP_TEMPLATE_KEYS) {
    const text = String(templates[key] ?? '');
    if (text.length > WHATSAPP_TEMPLATE_CHAR_LIMIT) {
      return { ok: false, erro: `Template "${key}" excede ${WHATSAPP_TEMPLATE_CHAR_LIMIT} caracteres` };
    }
    const v = validateTemplatePlaceholders(text);
    if (!v.ok) warnings.push({ key, unknown: v.unknown });
  }
  return { ok: true, warnings };
}

function archiveKey(parsed, key, userId) {
  const current = String(parsed.templates[key] ?? '');
  if (!current.trim()) return parsed.archive;
  return {
    ...parsed.archive,
    [key]: {
      body: current,
      archivedAt: new Date().toISOString(),
      archivedBy: String(userId || '').trim() || 'system',
      archived: true,
    },
  };
}

export default async function academyWhatsappTemplatesHandler(req, res) {
  const me = await ensureAuth(req, res);
  if (!me) return;

  if (req.method === 'GET') {
    const access = await ensureAcademyAccess(req, res, me);
    if (!access) return;
    const { doc } = access;
    const { templates, archive } = parseWhatsappTemplatesField(doc?.whatsappTemplates);
    return json(res, 200, {
      sucesso: true,
      templates,
      archive,
      academy_name: String(doc?.name || '').trim(),
      zapster_instance_id: String(doc?.zapster_instance_id || doc?.zapsterInstanceId || '').trim(),
      automations_config: String(doc?.automations_config || ''),
      updated_at: String(doc?.whatsapp_templates_updated_at || '').trim() || null,
      updated_by: String(doc?.whatsapp_templates_updated_by || '').trim() || null,
      system_count: WHATSAPP_TEMPLATE_KEYS.length,
    });
  }

  if (req.method === 'PATCH') {
    const access = await ensureAcademyOwnerOrAdmin(req, res, me);
    if (!access) return;
    const { academyId, doc } = access;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || 'save').trim();
    const key = String(body.key || '').trim();
    const parsed = parseWhatsappTemplatesField(doc?.whatsappTemplates);
    let nextTemplates = { ...parsed.templates };
    let nextArchive = { ...parsed.archive };

    if (action === 'restore' && key && WHATSAPP_TEMPLATE_KEYS.includes(key)) {
      nextArchive = archiveKey(parsed, key, me.$id);
      nextTemplates[key] = DEFAULT_WHATSAPP_TEMPLATES[key] || '';
    } else if (action === 'restore_all') {
      for (const k of WHATSAPP_TEMPLATE_KEYS) {
        nextArchive = archiveKey({ templates: nextTemplates, archive: nextArchive }, k, me.$id);
        nextTemplates[k] = DEFAULT_WHATSAPP_TEMPLATES[k] || '';
      }
    } else {
      const patch = pickTemplatesPayload(body);
      if (Object.keys(patch).length === 0) {
        return json(res, 400, { sucesso: false, erro: 'Nenhum template válido no body' });
      }
      nextTemplates = { ...nextTemplates, ...patch };
    }

    const validation = validateAllTemplates(nextTemplates);
    if (!validation.ok) return json(res, 400, { sucesso: false, erro: validation.erro });

    const payload = serializeWhatsappTemplatesField(nextTemplates, nextArchive);
    const now = new Date().toISOString();
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        whatsappTemplates: JSON.stringify(payload),
        whatsapp_templates_updated_at: now,
        whatsapp_templates_updated_by: String(me.$id || '').trim(),
      });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: apiErro(e, 'save') });
    }

    return json(res, 200, {
      sucesso: true,
      templates: nextTemplates,
      archive: nextArchive,
      updated_at: now,
      updated_by: String(me.$id || '').trim(),
      warnings: validation.warnings || [],
    });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
