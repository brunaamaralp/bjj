/** Templates de tarefas por academia (gatilhos automáticos e manual). */

export const TASK_TEMPLATE_TRIGGERS = {
  STUDENT_EXIT: 'student_exit',
  ENROLLMENT: 'enrollment',
  MANUAL: 'manual',
  STUDENT_FREEZE: 'student_freeze',
  STUDENT_REACTIVATION: 'student_reactivation',
  STUDENT_BIRTHDAY: 'student_birthday',
  STUDENT_UNFREEZE: 'student_unfreeze',
};

export const TASK_TEMPLATE_TRIGGER_LABELS = {
  [TASK_TEMPLATE_TRIGGERS.STUDENT_EXIT]: 'Desligamento de aluno',
  [TASK_TEMPLATE_TRIGGERS.ENROLLMENT]: 'Matrícula',
  [TASK_TEMPLATE_TRIGGERS.MANUAL]: 'Manual',
  [TASK_TEMPLATE_TRIGGERS.STUDENT_FREEZE]: 'Trancamento de aluno',
  [TASK_TEMPLATE_TRIGGERS.STUDENT_REACTIVATION]: 'Reativação de aluno',
  [TASK_TEMPLATE_TRIGGERS.STUDENT_BIRTHDAY]: 'Aniversário do aluno',
  [TASK_TEMPLATE_TRIGGERS.STUDENT_UNFREEZE]: 'Encerramento de trancamento',
};

const TEMPLATE_MARKER = '[task_template]';

export const DEFAULT_STUDENT_EXIT_TEMPLATE = {
  name: 'Desligamento de aluno',
  trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_EXIT,
  tasks: [
    { title: 'Verificar e quitar pendências financeiras', offset_days: 0, notes: '', order: 0 },
    { title: 'Cancelar cadastro no sistema de gestão', offset_days: 0, notes: '', order: 1 },
    { title: 'Atualizar status no CRM para Inativo', offset_days: 0, notes: '', order: 2 },
    { title: 'Remover dos grupos de comunicação', offset_days: 0, notes: '', order: 3 },
    { title: 'Registrar motivo de saída', offset_days: 0, notes: '', order: 4 },
    { title: 'Verificar itens a devolver', offset_days: 0, notes: '', order: 5 },
    { title: 'Comunicar responsável da academia', offset_days: 0, notes: '', order: 6 },
  ],
};

export const DEFAULT_ENROLLMENT_TEMPLATE = {
  name: 'Onboarding — novo aluno (matrícula)',
  trigger: TASK_TEMPLATE_TRIGGERS.ENROLLMENT,
  tasks: [
    { title: 'Boas-vindas e orientação inicial', offset_days: 0, notes: '', order: 0 },
    { title: 'Adicionar ao grupo de comunicação', offset_days: 0, notes: '', order: 1 },
    { title: 'Confirmar materiais / kimono entregues', offset_days: 1, notes: '', order: 2 },
    { title: 'Check-in de adaptação (30 dias)', offset_days: 30, notes: '', order: 3 },
  ],
};

export const DEFAULT_STUDENT_FREEZE_TEMPLATE = {
  name: 'Trancamento de plano',
  trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_FREEZE,
  tasks: [
    { title: 'Confirmar período e motivo do trancamento', offset_days: 0, notes: '', order: 0 },
    { title: 'Ajustar acesso na catraca e grupos', offset_days: 0, notes: '', order: 1 },
    { title: 'Revisar mensalidades congeladas no período', offset_days: 1, notes: '', order: 2 },
  ],
};

export const DEFAULT_STUDENT_REACTIVATION_TEMPLATE = {
  name: 'Reativação de aluno',
  trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_REACTIVATION,
  tasks: [
    { title: 'Restaurar acesso na catraca e grupos', offset_days: 0, notes: '', order: 0 },
    { title: 'Confirmar plano e próximo vencimento', offset_days: 0, notes: '', order: 1 },
    { title: 'Boas-vindas de retorno ao tatame', offset_days: 1, notes: '', order: 2 },
  ],
};

export const DEFAULT_STUDENT_BIRTHDAY_TEMPLATE = {
  name: 'Aniversário do aluno',
  trigger: TASK_TEMPLATE_TRIGGERS.STUDENT_BIRTHDAY,
  tasks: [{ title: 'Enviar mensagem de parabéns', offset_days: 0, notes: '', order: 0 }],
};

export const DEFAULT_TASK_TEMPLATES = [
  DEFAULT_STUDENT_EXIT_TEMPLATE,
  DEFAULT_ENROLLMENT_TEMPLATE,
  DEFAULT_STUDENT_FREEZE_TEMPLATE,
  DEFAULT_STUDENT_REACTIVATION_TEMPLATE,
  DEFAULT_STUDENT_BIRTHDAY_TEMPLATE,
];

function normalizeItem(raw, index) {
  return {
    title: String(raw?.title || '').trim() || `Item ${index + 1}`,
    offset_days: Math.max(0, Math.min(365, Math.trunc(Number(raw?.offset_days ?? raw?.offsetDays ?? 0) || 0))),
    notes: raw?.notes == null ? '' : String(raw.notes),
    order: Number.isFinite(Number(raw?.order)) ? Math.trunc(Number(raw.order)) : index,
    assigned_to: String(raw?.assigned_to ?? raw?.default_assignee ?? '').trim().slice(0, 64),
  };
}

export function parseTemplateItems(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, i) => normalizeItem(item, i))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'pt-BR'));
  } catch {
    return [];
  }
}

export function serializeTemplateItems(items) {
  const list = (items || []).map((item, i) => normalizeItem(item, i));
  return JSON.stringify(list);
}

export function mapTemplateDoc(doc) {
  if (!doc) return null;
  const items = parseTemplateItems(doc.items_json ?? doc.items ?? doc.tasks);
  return {
    id: doc.$id || doc.id,
    academy_id: String(doc.academy_id || ''),
    name: String(doc.name || '').trim(),
    trigger: String(doc.trigger || TASK_TEMPLATE_TRIGGERS.MANUAL).trim(),
    tasks: items,
    enabled: doc.enabled !== false,
    created_at: doc.created_at || doc.$createdAt || '',
    updated_at: doc.updated_at || doc.$updatedAt || '',
  };
}

export function addDaysToYmd(ymd, days) {
  const base = String(ymd || '').trim().slice(0, 10);
  const d = base.match(/^\d{4}-\d{2}-\d{2}$/)
    ? new Date(`${base}T12:00:00`)
    : new Date();
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  d.setDate(d.getDate() + Math.trunc(Number(days) || 0));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildTemplateTaskDescription({
  templateId,
  batchId,
  templateName,
  itemOrder,
  notes,
}) {
  const lines = [
    TEMPLATE_MARKER,
    `template_id: ${String(templateId || '').trim()}`,
    `batch_id: ${String(batchId || '').trim()}`,
    `template_name: ${String(templateName || '').trim()}`,
    `item_order: ${Math.trunc(Number(itemOrder) || 0)}`,
    '---',
    String(notes || '').trim(),
  ];
  return lines.join('\n').trim();
}

export function parseTemplateTaskMeta(description) {
  const text = String(description || '');
  if (!text.includes(TEMPLATE_MARKER)) return null;
  const templateId = (text.match(/^template_id:\s*(.+)$/m) || [])[1]?.trim() || '';
  const batchId = (text.match(/^batch_id:\s*(.+)$/m) || [])[1]?.trim() || '';
  const templateName = (text.match(/^template_name:\s*(.+)$/m) || [])[1]?.trim() || '';
  const itemOrder = Math.trunc(Number((text.match(/^item_order:\s*(\d+)/m) || [])[1] || 0));
  const parts = text.split(/\n---\n/);
  const notes = parts.length > 1 ? parts.slice(1).join('\n---\n').trim() : '';
  return { templateId, batchId, templateName, itemOrder, notes };
}

export function isTemplateTask(task) {
  return (
    Boolean(task?.template_batch_id || task?.templateBatchId) ||
    String(task?.description || '').includes(TEMPLATE_MARKER)
  );
}

/** Progresso por lote de template no mesmo aluno. */
export function groupTemplateProgressByLead(tasks) {
  const byLead = {};
  for (const t of tasks || []) {
    const leadId = String(t.lead_id || t.leadId || '').trim();
    if (!leadId) continue;
    const meta = parseTemplateTaskMeta(t.description);
    const batchId = String(t.template_batch_id || t.templateBatchId || meta?.batchId || '').trim();
    if (!batchId) continue;
    const key = `${leadId}::${batchId}`;
    if (!byLead[key]) {
      byLead[key] = {
        leadId,
        batchId,
        templateName: String(t.template_name || t.templateName || meta?.templateName || 'Template'),
        total: 0,
        done: 0,
      };
    }
    byLead[key].total += 1;
    if (String(t.status || '').toLowerCase() === 'done') byLead[key].done += 1;
  }
  return byLead;
}

export function progressLabelForLead(leadId, tasks) {
  const groups = groupTemplateProgressByLead(tasks);
  const forLead = Object.values(groups).filter((g) => g.leadId === leadId);
  if (!forLead.length) return null;
  const g = forLead[0];
  if (forLead.length > 1) {
    const total = forLead.reduce((s, x) => s + x.total, 0);
    const done = forLead.reduce((s, x) => s + x.done, 0);
    return `${done} de ${total} concluídas`;
  }
  return `${g.done} de ${g.total} concluídas`;
}
