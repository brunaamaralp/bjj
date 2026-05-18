import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../lib/server/academyAccess.js';
import { applyTaskTemplate } from '../lib/server/applyTaskTemplate.js';
import {
  createTaskTemplate,
  deleteTaskTemplate,
  getTaskTemplateById,
  isTaskTemplatesConfigured,
  listTaskTemplates,
  provisionDefaultTaskTemplates,
  updateTaskTemplate,
} from '../lib/server/taskTemplateStore.js';
import { TASK_TEMPLATE_TRIGGERS } from '../src/lib/taskTemplates.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || process.env.VITE_APPWRITE_DATABASE_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

function ensureJsonBody(req, res) {
  const ct = String(req.headers['content-type'] || '');
  if (!ct.includes('application/json')) {
    json(res, 400, { sucesso: false, erro: 'Content-Type inválido' });
    return false;
  }
  if (!req.body || typeof req.body !== 'object') {
    json(res, 400, { sucesso: false, erro: 'Body ausente' });
    return false;
  }
  return true;
}

function templateIdFromRequest(req) {
  const q = String(req.query?.id || '').trim();
  if (q) return q;
  const url = String(req.url || '');
  const m = url.match(/\/api\/task-templates\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export default async function handler(req, res) {
  const method = req.method?.toUpperCase();
  const action = String(req.query?.action || '').trim().toLowerCase();

  if (!DB_ID) return json(res, 500, { sucesso: false, erro: 'Database não configurado' });
  if (!isTaskTemplatesConfigured()) {
    if (method === 'GET') return json(res, 200, { sucesso: true, templates: [], configurado: false });
    return json(res, 503, { sucesso: false, erro: 'Coleção task_templates não configurada' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  if (method === 'POST' && action === 'apply') {
    if (!ensureJsonBody(req, res)) return;
    const trigger = String(req.body.trigger || '').trim();
    const templateId = String(req.body.template_id || '').trim();
    const leadId = String(req.body.lead_id || '').trim();
    const leadName = String(req.body.lead_name || '').trim();
    const anchorDate = String(req.body.anchor_date || '').trim();
    const preview = req.body.preview === true;

    if (!trigger && !templateId) {
      return json(res, 400, { sucesso: false, erro: 'trigger ou template_id obrigatório' });
    }
    if (!preview && !leadId) {
      return json(res, 400, { sucesso: false, erro: 'lead_id obrigatório' });
    }

    try {
      const out = await applyTaskTemplate({
        databases,
        dbId: DB_ID,
        academyId,
        trigger: trigger || undefined,
        templateId: templateId || undefined,
        leadId,
        leadName,
        anchorDate,
        createdBy: me.$id,
        preview,
      });
      return json(res, 200, { sucesso: true, ...out });
    } catch (e) {
      console.error('[task-templates] apply:', e);
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao aplicar template' });
    }
  }

  if (method === 'POST' && action === 'provision') {
    try {
      const out = await provisionDefaultTaskTemplates(databases, DB_ID, academyId);
      return json(res, 200, { sucesso: true, ...out });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao provisionar' });
    }
  }

  if (method === 'GET') {
    const trigger = String(req.query.trigger || '').trim();
    try {
      const templates = await listTaskTemplates(databases, DB_ID, academyId, {
        trigger: trigger || undefined,
      });
      return json(res, 200, { sucesso: true, templates, configurado: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao listar templates' });
    }
  }

  if (method === 'POST') {
    if (!ensureJsonBody(req, res)) return;
    const name = String(req.body.name || '').trim();
    const trigger = String(req.body.trigger || TASK_TEMPLATE_TRIGGERS.MANUAL).trim();
    if (!name) return json(res, 400, { sucesso: false, erro: 'name obrigatório' });
    try {
      if (trigger !== TASK_TEMPLATE_TRIGGERS.MANUAL) {
        const existing = await listTaskTemplates(databases, DB_ID, academyId, { trigger });
        if (existing.length > 0) {
          return json(res, 400, {
            sucesso: false,
            erro: 'Já existe um template automático para este gatilho. Edite o existente ou use gatilho manual.',
          });
        }
      }
      const template = await createTaskTemplate(databases, DB_ID, academyId, {
        name,
        trigger,
        tasks: req.body.tasks,
      });
      return json(res, 201, { sucesso: true, template });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao criar template' });
    }
  }

  if (method === 'PATCH') {
    if (!ensureJsonBody(req, res)) return;
    const id = templateIdFromRequest(req);
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });
    try {
      const cur = await getTaskTemplateById(databases, DB_ID, id, academyId);
      if (!cur) return json(res, 404, { sucesso: false, erro: 'Template não encontrado' });
      const template = await updateTaskTemplate(databases, DB_ID, id, academyId, {
        name: req.body.name,
        trigger: req.body.trigger,
        tasks: req.body.tasks,
      });
      return json(res, 200, { sucesso: true, template });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao atualizar template' });
    }
  }

  if (method === 'DELETE') {
    const id = templateIdFromRequest(req);
    if (!id) return json(res, 400, { sucesso: false, erro: 'id obrigatório' });
    try {
      await deleteTaskTemplate(databases, DB_ID, id, academyId);
      return json(res, 200, { sucesso: true });
    } catch (e) {
      return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao excluir template' });
    }
  }

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}
