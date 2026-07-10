/**
 * Registry de tipos de evento de auditoria (envelope canônico).
 * Legado: team_member_* mantém strings existentes para filtros da Equipe.
 */
import { formatBRL } from '../../src/lib/moneyBr.js';

export const AUDIT_SCHEMA_VERSION = 1;

export const AUDIT_EVENTS = {
  TASKS_COMPLETED: 'tasks.completed',
  TASKS_CREATED: 'tasks.created',
  INBOX_NOTE_ADDED: 'inbox.note_added',
  SALES_CREATED: 'sales.created',
  SALES_CANCELLED: 'sales.cancelled',
  SALES_DRAFT_DISCARDED: 'sales.draft_discarded',
};

/** Mapeamento action → event_type canônico (financial_audit_log). */
export const FINANCE_AUDIT_EVENT_MAP = {
  sale_create: 'finance.sale_created',
  sale_liquidate: 'finance.sale_liquidated',
  payment_create: 'finance.payment_created',
  payment_update: 'finance.payment_updated',
  payment_delete: 'finance.payment_deleted',
  gateway_payment_conflict: 'finance.gateway_payment_conflict',
  tx_create: 'finance.tx_created',
  tx_settle: 'finance.tx_settled',
  tx_cancel: 'finance.tx_cancelled',
  tx_edit: 'finance.tx_edited',
  tx_assign_bank: 'finance.tx_bank_assigned',
  tx_reverse: 'finance.tx_reversed',
  anticipation_fee: 'finance.anticipation_fee',
  whatsapp_reminder: 'finance.whatsapp_reminder',
};

/** sale_create já grava sales.created no handler de vendas. */
export const FINANCE_AUDIT_SKIP_ACADEMY_MIRROR = new Set(['sale_create']);

export function financeActionToAuditEvent(action) {
  return FINANCE_AUDIT_EVENT_MAP[String(action || '').trim()] || '';
}

export const AUDIT_DOMAIN_LABELS = {
  tasks: 'Tarefas',
  sales: 'Vendas',
  inbox: 'Inbox',
  team: 'Equipe',
  finance: 'Financeiro',
  inventory: 'Estoque',
  bank: 'Financeiro',
  crm: 'CRM',
};

export function auditDomainForEventType(eventType) {
  const t = String(eventType || '').trim();
  if (!t) return '';
  if (t.startsWith('tasks.')) return 'tasks';
  if (t.startsWith('sales.')) return 'sales';
  if (t.startsWith('inbox.')) return 'inbox';
  if (t.startsWith('team_member')) return 'team';
  if (t.startsWith('finance.') || t.startsWith('finance_')) return 'finance';
  if (t.startsWith('bank_')) return 'finance';
  if (t.startsWith('inventory_')) return 'inventory';
  const { domain } = parseEventType(t);
  return domain || '';
}

export function eventMatchesAuditDomain(eventType, domainFilter) {
  const d = String(domainFilter || '').trim().toLowerCase();
  if (!d) return true;
  const eventDomain = auditDomainForEventType(eventType);
  if (d === 'finance') return eventDomain === 'finance' || eventDomain === 'bank';
  return eventDomain === d;
}

/**
 * @param {string} action
 * @param {{ amount?: number, new_status?: string, previous_status?: string, user_id?: string }} entry
 */
export function defaultFinanceAuditSummary(action, entry = {}) {
  const amount = Number(entry.amount);
  const amt = Number.isFinite(amount) ? formatBRL(amount) : '';
  const status = String(entry.new_status || '').trim();
  switch (action) {
    case 'sale_liquidate':
      return `Venda liquidada${amt ? ` · ${amt}` : ''}`;
    case 'payment_create':
      return `Mensalidade criada${amt ? ` · ${amt}` : ''}`;
    case 'payment_update':
      return `Mensalidade atualizada${status ? ` · ${status}` : ''}`;
    case 'gateway_payment_conflict':
      return 'Conflito de pagamento gateway — cobrança já liquidada com outro ID';
    case 'payment_delete':
      return 'Mensalidade excluída';
    case 'tx_create':
      return `Lançamento criado${amt ? ` · ${amt}` : ''}`;
    case 'tx_settle':
      return `Lançamento liquidado${amt ? ` · ${amt}` : ''}`;
    case 'tx_cancel':
      return 'Lançamento cancelado';
    case 'tx_edit':
      return 'Lançamento editado';
    case 'tx_assign_bank':
      return 'Lançamento conciliado com extrato';
    case 'tx_reverse':
      return 'Lançamento estornado';
    case 'anticipation_fee':
      return `Taxa de antecipação${amt ? ` · ${amt}` : ''}`;
    case 'whatsapp_reminder':
      return 'Lembrete de cobrança via WhatsApp';
    default:
      return `Financeiro · ${action}`;
  }
}

export const TEAM_EVENT_TYPES = {
  ADDED: 'team_member_added',
  REMOVED: 'team_member_removed',
  UPDATED: 'team_member_updated',
  PASSWORD_RESET: 'team_member_password_reset',
};

export const INVENTORY_EVENT_TYPES = {
  RESTOCK_TASK_CREATED: 'inventory_restock_task_created',
  RESTOCK_TASK_UPDATED: 'inventory_restock_task_updated',
  ADJUSTED: 'inventory_adjusted',
};

export const FINANCE_RECURRENCE_EVENT_TYPES = {
  CREATED: 'finance_recurrence_created',
  GENERATED: 'finance_recurrence_generated',
  CANCELLED: 'finance_recurrence_cancelled',
};

export const BANK_RECONCILIATION_EVENT_TYPES = {
  IMPORTED: 'bank_statement_imported',
  MATCHED: 'bank_reconciliation_matched',
  MANUAL: 'bank_reconciliation_manual',
  COMPLETED: 'bank_reconciliation_completed',
};

/** @param {string} eventType */
export function parseEventType(eventType) {
  const raw = String(eventType || '').trim();
  if (!raw) return { domain: '', action: '' };
  if (raw.includes('.')) {
    const [domain, ...rest] = raw.split('.');
    return { domain: domain || '', action: rest.join('.') || '' };
  }
  const idx = raw.indexOf('_');
  if (idx <= 0) return { domain: raw, action: '' };
  return { domain: raw.slice(0, idx), action: raw.slice(idx + 1) };
}

/**
 * @param {string} eventType
 * @param {{ actor?: { name?: string }, target?: { name?: string }, payload?: Record<string, unknown> }} ctx
 */
export function defaultSummary(eventType, ctx = {}) {
  const actor = String(ctx.actor?.name || 'Alguém').trim() || 'Alguém';
  const target = String(ctx.target?.name || '').trim();
  const title = String(ctx.payload?.title || target || 'Sem título').trim() || 'Sem título';
  const total = Number(ctx.payload?.total);

  switch (eventType) {
    case AUDIT_EVENTS.TASKS_COMPLETED:
      return `${actor} concluiu a tarefa «${title}»`;
    case AUDIT_EVENTS.TASKS_CREATED:
      return `${actor} criou a tarefa «${title}»`;
    case AUDIT_EVENTS.INBOX_NOTE_ADDED:
      return `${actor} adicionou nota interna na conversa`;
    case AUDIT_EVENTS.SALES_CREATED:
      return `${actor} registrou venda de ${formatBRL(Number.isFinite(total) ? total : 0)}`;
    case AUDIT_EVENTS.SALES_CANCELLED:
      return `${actor} cancelou venda${target ? ` ${target}` : ''}`;
    case TEAM_EVENT_TYPES.ADDED:
      return `${actor} adicionou ${target || 'membro'}${ctx.payload?.new_role ? ` como ${ctx.payload.new_role}` : ''}`;
    case TEAM_EVENT_TYPES.REMOVED:
      return `${actor} removeu ${target || 'membro'} da equipe`;
    case TEAM_EVENT_TYPES.PASSWORD_RESET:
      return `${actor} enviou e-mail de redefinição de senha para ${target || 'membro'}`;
    case TEAM_EVENT_TYPES.UPDATED:
      return `${actor} atualizou os dados de ${target || 'membro'}`;
    default:
      return `${actor} — ${eventType}`;
  }
}
