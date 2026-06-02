export function isTaskOverdue(dateStr) {
  if (!dateStr) return false;
  const due = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr).getTime();
  const now = new Date().setHours(0, 0, 0, 0);
  return due < now;
}

export function formatTaskDueRelative(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr.length === 10 ? `${dateStr}T00:00:00` : dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  const diffDays = Math.round((dueDay.getTime() - today.getTime()) / 86400000);
  if (diffDays === 0) return { text: 'Hoje', title: 'Vence hoje' };
  if (diffDays === 1) return { text: 'Amanhã', title: 'Vence amanhã' };
  if (diffDays === -1) return { text: 'Ontem', title: 'Venceu ontem' };
  if (diffDays > 1) return { text: `${diffDays} dias`, title: `Vence em ${diffDays} dias` };
  return { text: `${Math.abs(diffDays)} dias`, title: `Atrasada há ${Math.abs(diffDays)} dias` };
}

export function formatTaskDueDate(dateStr) {
  const raw = String(dateStr || '').trim();
  if (!raw) return '';
  try {
    return new Date(`${raw.slice(0, 10)}T00:00:00`).toLocaleDateString('pt-BR');
  } catch {
    return raw;
  }
}
