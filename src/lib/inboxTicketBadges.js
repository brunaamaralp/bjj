/** Mapeamento de status de ticket Inbox → StatusBadge */
export const INBOX_TICKET_BADGE_MAP = {
  resolved: { label: 'Resolvido', tone: 'success' },
  waiting_customer: { label: 'Aguardando cliente', tone: 'warning' },
  transferred: { label: 'Transferido', tone: 'info' },
  in_progress: { label: 'Em andamento', tone: 'info' },
};

export function resolveInboxTicketBadge(status, transferTo) {
  const s = String(status || '').trim().toLowerCase();
  if (s === 'transferred') {
    return {
      status: 'transferred',
      label: transferTo ? `Transferido • ${transferTo}` : 'Transferido',
      tone: 'info',
    };
  }
  if (s === 'resolved') return { status: 'resolved', label: 'Resolvido', tone: 'success' };
  if (s === 'waiting_customer') return { status: 'waiting_customer', label: 'Aguardando cliente', tone: 'warning' };
  return { status: 'in_progress', label: 'Em andamento', tone: 'info', isDefault: true };
}
