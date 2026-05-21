import { ID, Permission, Role } from 'node-appwrite';
import {
  addDaysToYmd,
  buildTemplateTaskDescription,
} from '../../src/lib/taskTemplates.js';
import { findTemplateForTrigger } from './taskTemplateStore.js';

const TASKS_COL =
  process.env.APPWRITE_TASKS_COLLECTION_ID || process.env.VITE_APPWRITE_TASKS_COLLECTION_ID || '';

/**
 * Cria tarefas a partir de um template (ou preview sem persistir).
 */
export async function applyTaskTemplate({
  databases,
  dbId,
  academyId,
  trigger,
  templateId,
  leadId,
  leadName,
  anchorDate,
  createdBy,
  preview = false,
}) {
  const template = await findTemplateForTrigger(databases, dbId, academyId, trigger, templateId);
  if (!template || !template.tasks?.length) {
    return { created: 0, tasks: [], templateName: '', batchId: '' };
  }

  const batchId = ID.unique();
  const anchor = String(anchorDate || '').trim().slice(0, 10) || new Date().toISOString().slice(0, 10);
  const name = String(leadName || '').trim();
  const lid = String(leadId || '').trim();
  const out = [];

  for (const item of template.tasks) {
    const dueDate = addDaysToYmd(anchor, item.offset_days);
    const description = buildTemplateTaskDescription({
      templateId: template.id,
      batchId,
      templateName: template.name,
      itemOrder: item.order,
      notes: item.notes,
    });

    const row = {
      title: item.title,
      description,
      status: 'pending',
      due_date: dueDate,
      lead_id: lid,
      lead_name: name,
      template_id: template.id,
      template_batch_id: batchId,
      template_name: template.name,
    };

    if (preview) {
      out.push({ ...row, preview: true });
      continue;
    }

    if (!TASKS_COL) throw new Error('tasks_collection_not_configured');

    const nowIso = new Date().toISOString();
    const payload = {
      academy_id: academyId,
      title: row.title,
      description: row.description,
      status: 'pending',
      due_date: dueDate,
      assigned_to: String(item.assigned_to || '').trim().slice(0, 64),
      lead_id: lid,
      lead_name: name,
      created_by: String(createdBy || 'system'),
      created_at: nowIso,
      updated_at: nowIso,
      template_id: template.id,
      template_batch_id: batchId,
      template_name: template.name.slice(0, 128),
    };

    let doc;
    try {
      doc = await databases.createDocument(dbId, TASKS_COL, ID.unique(), payload, [
        Permission.read(Role.users()),
        Permission.update(Role.users()),
        Permission.delete(Role.users()),
      ]);
    } catch (e) {
      const msg = String(e?.message || '');
      if (msg.includes('Unknown attribute')) {
        delete payload.template_id;
        delete payload.template_batch_id;
        delete payload.template_name;
        if (msg.includes('updated_at')) delete payload.updated_at;
        if (msg.includes('created_at')) delete payload.created_at;
        doc = await databases.createDocument(dbId, TASKS_COL, ID.unique(), payload, [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ]);
      } else {
        throw e;
      }
    }

    out.push({
      id: doc.$id,
      ...row,
    });
  }

  return {
    created: out.length,
    tasks: out,
    templateName: template.name,
    batchId,
    templateId: template.id,
  };
}
