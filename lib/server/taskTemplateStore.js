/**
 * CRUD e provisionamento de task_templates (Appwrite).
 */
import { ID, Permission, Role, Query } from 'node-appwrite';
import {
  DEFAULT_TASK_TEMPLATES,
  mapTemplateDoc,
  serializeTemplateItems,
  TASK_TEMPLATE_TRIGGERS,
} from '../../src/lib/taskTemplates.js';

const TEMPLATES_COL =
  process.env.APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  process.env.VITE_APPWRITE_TASK_TEMPLATES_COLLECTION_ID ||
  '';

export function isTaskTemplatesConfigured() {
  return Boolean(TEMPLATES_COL);
}

export async function listTaskTemplates(databases, dbId, academyId, { trigger, includeDisabled = false } = {}) {
  if (!TEMPLATES_COL || !dbId) return [];
  const queries = [Query.equal('academy_id', academyId), Query.limit(100), Query.orderAsc('name')];
  if (trigger) queries.push(Query.equal('trigger', trigger));
  if (!includeDisabled) queries.push(Query.equal('enabled', true));
  const res = await databases.listDocuments(dbId, TEMPLATES_COL, queries);
  return (res.documents || []).map(mapTemplateDoc).filter(Boolean);
}

export async function getTaskTemplateById(databases, dbId, templateId, academyId) {
  if (!TEMPLATES_COL || !templateId) return null;
  const doc = await databases.getDocument(dbId, TEMPLATES_COL, templateId);
  if (String(doc.academy_id || '') !== String(academyId)) return null;
  return mapTemplateDoc(doc);
}

export async function createTaskTemplate(databases, dbId, academyId, payload) {
  const now = new Date().toISOString();
  const doc = await databases.createDocument(
    dbId,
    TEMPLATES_COL,
    ID.unique(),
    {
      academy_id: academyId,
      name: String(payload.name || '').trim().slice(0, 128),
      trigger: String(payload.trigger || TASK_TEMPLATE_TRIGGERS.MANUAL).slice(0, 32),
      items_json: serializeTemplateItems(payload.tasks),
      enabled: payload.enabled !== false,
      created_at: now,
      updated_at: now,
    },
    [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())]
  );
  return mapTemplateDoc(doc);
}

export async function updateTaskTemplate(databases, dbId, templateId, academyId, patch) {
  const data = { updated_at: new Date().toISOString() };
  if (patch.name != null) data.name = String(patch.name).trim().slice(0, 128);
  if (patch.trigger != null) data.trigger = String(patch.trigger).slice(0, 32);
  if (patch.tasks != null) data.items_json = serializeTemplateItems(patch.tasks);
  if (patch.enabled != null) data.enabled = Boolean(patch.enabled);
  const doc = await databases.updateDocument(dbId, TEMPLATES_COL, templateId, data);
  if (String(doc.academy_id || '') !== academyId) throw new Error('forbidden');
  return mapTemplateDoc(doc);
}

export async function deleteTaskTemplate(databases, dbId, templateId, academyId) {
  const cur = await getTaskTemplateById(databases, dbId, templateId, academyId);
  if (!cur) throw new Error('not_found');
  await databases.deleteDocument(dbId, TEMPLATES_COL, templateId);
  return true;
}

export async function findTemplateForTrigger(databases, dbId, academyId, trigger, templateId) {
  const list = await listTaskTemplates(databases, dbId, academyId, { trigger });
  if (templateId) return list.find((t) => t.id === templateId) || null;
  return list.find((t) => t.trigger === trigger) || null;
}

export async function provisionDefaultTaskTemplates(databases, dbId, academyId) {
  if (!TEMPLATES_COL || !dbId || !academyId) return { created: 0, skipped: true };

  const existing = await listTaskTemplates(databases, dbId, academyId, { includeDisabled: true });
  const hasTrigger = new Set(existing.map((t) => t.trigger));
  let created = 0;

  for (const def of DEFAULT_TASK_TEMPLATES) {
    if (hasTrigger.has(def.trigger)) continue;
    await createTaskTemplate(databases, dbId, academyId, def);
    created += 1;
  }
  return { created, skipped: false };
}
