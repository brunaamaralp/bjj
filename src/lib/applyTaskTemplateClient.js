import { createSessionJwt } from './appwrite.js';
import { TASK_TEMPLATE_TRIGGERS } from './taskTemplates.js';

/**
 * Aplica template por gatilho via API (cria tarefas no servidor).
 * @returns {Promise<{ created: number, templateName: string, batchId: string, tasks: object[] }>}
 */
export async function applyTaskTemplateForTrigger({
  academyId,
  trigger,
  templateId,
  leadId,
  leadName,
  anchorDate,
  preview = false,
}) {
  const aid = String(academyId || '').trim();
  if (!aid) return { created: 0, templateName: '', batchId: '', tasks: [] };

  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('jwt_missing');

  const res = await fetch('/api/task-templates?action=apply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': aid,
    },
    body: JSON.stringify({
      trigger,
      template_id: templateId || '',
      lead_id: leadId,
      lead_name: leadName,
      anchor_date: anchorDate,
      preview,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.sucesso) {
    throw new Error(data?.erro || `HTTP ${res.status}`);
  }
  return {
    created: Number(data.created) || 0,
    templateName: String(data.templateName || ''),
    batchId: String(data.batchId || ''),
    tasks: data.tasks || [],
  };
}

export { TASK_TEMPLATE_TRIGGERS };
