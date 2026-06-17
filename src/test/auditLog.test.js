import { describe, it, expect } from 'vitest';
import {
  stripSecrets,
  mapEnvelopeToAcademyDoc,
  legacyAcademyEventToInput,
  formatAuditEventSummary,
  mapAuditDocToFeedEvent,
} from '../../lib/server/auditLog.js';
import {
  AUDIT_EVENTS,
  parseEventType,
  defaultSummary,
  TEAM_EVENT_TYPES,
  financeActionToAuditEvent,
  defaultFinanceAuditSummary,
  auditDomainForEventType,
  eventMatchesAuditDomain,
} from '../../lib/server/auditEventTypes.js';

describe('parseEventType', () => {
  it('parses dotted event types', () => {
    expect(parseEventType('tasks.completed')).toEqual({ domain: 'tasks', action: 'completed' });
  });

  it('parses legacy underscore types', () => {
    expect(parseEventType('team_member_added')).toEqual({ domain: 'team', action: 'member_added' });
  });
});

describe('defaultSummary', () => {
  it('formats task completion', () => {
    const s = defaultSummary(AUDIT_EVENTS.TASKS_COMPLETED, {
      actor: { name: 'Maria' },
      payload: { title: 'Ligar para João' },
    });
    expect(s).toContain('Maria');
    expect(s).toContain('Ligar para João');
  });

  it('formats sales with BRL', () => {
    const s = defaultSummary(AUDIT_EVENTS.SALES_CREATED, {
      actor: { name: 'GBLP' },
      payload: { total: 189 },
    });
    expect(s).toContain('GBLP');
    expect(s).toMatch(/189/);
  });
});

describe('stripSecrets', () => {
  it('removes sensitive keys recursively', () => {
    const out = stripSecrets({
      title: 'ok',
      password: 'secret',
      nested: { token: 'x', keep: 1 },
    });
    expect(out).toEqual({ title: 'ok', nested: { keep: 1 } });
  });
});

describe('mapEnvelopeToAcademyDoc', () => {
  it('builds canonical payload_json envelope', () => {
    const doc = mapEnvelopeToAcademyDoc({
      eventType: AUDIT_EVENTS.INBOX_NOTE_ADDED,
      academyId: 'acad-1',
      actor: { type: 'user', id: 'u1', name: 'Maria' },
      target: { type: 'conversation', id: 'conv-1' },
      context: { conversation_id: 'conv-1' },
      source: 'test',
      payload: { note_id: 'n1' },
    });
    expect(doc.academy_id).toBe('acad-1');
    expect(doc.event_type).toBe('inbox.note_added');
    expect(doc.actor_user_id).toBe('u1');
    expect(doc.summary).toContain('Maria');
    const envelope = JSON.parse(doc.payload_json);
    expect(envelope.schema_version).toBe(1);
    expect(envelope.event_type).toBe('inbox.note_added');
    expect(envelope.payload.note_id).toBe('n1');
  });

  it('maps legacy team fields for Equipe UI', () => {
    const input = legacyAcademyEventToInput({
      academy_id: 'acad-1',
      event_type: TEAM_EVENT_TYPES.ADDED,
      actor_user_id: 'owner-1',
      actor_name: 'Titular',
      target_user_id: 'user-2',
      target_name: 'Recep',
      new_role: 'receptionist',
    });
    const doc = mapEnvelopeToAcademyDoc(input);
    expect(doc.target_user_id).toBe('user-2');
    expect(doc.new_role).toBe('receptionist');
    expect(doc.event_type).toBe('team_member_added');
  });
});

describe('formatAuditEventSummary', () => {
  it('prefers doc.summary', () => {
    expect(formatAuditEventSummary({ summary: 'Pronto', event_type: 'x' })).toBe('Pronto');
  });

  it('falls back to payload_json summary', () => {
    expect(
      formatAuditEventSummary({
        event_type: AUDIT_EVENTS.TASKS_CREATED,
        payload_json: JSON.stringify({ summary: 'Criou tarefa' }),
      })
    ).toBe('Criou tarefa');
  });
});

describe('finance audit mapping', () => {
  it('maps tx_settle to finance.tx_settled', () => {
    expect(financeActionToAuditEvent('tx_settle')).toBe('finance.tx_settled');
  });

  it('builds finance summary', () => {
    const s = defaultFinanceAuditSummary('payment_create', { amount: 150 });
    expect(s).toContain('Mensalidade');
    expect(s).toMatch(/150/);
  });
});

describe('audit domain helpers', () => {
  it('classifies team events', () => {
    expect(auditDomainForEventType('team_member_added')).toBe('team');
  });

  it('filters by domain', () => {
    expect(eventMatchesAuditDomain('tasks.completed', 'tasks')).toBe(true);
    expect(eventMatchesAuditDomain('tasks.completed', 'sales')).toBe(false);
  });
});

describe('mapAuditDocToFeedEvent', () => {
  it('includes deep link for tasks', () => {
    const ev = mapAuditDocToFeedEvent({
      $id: 'ev1',
      event_type: 'tasks.completed',
      actor_user_id: 'u1',
      actor_name: 'Maria',
      timestamp: '2026-06-17T12:00:00.000Z',
      payload_json: JSON.stringify({
        summary: 'Maria concluiu a tarefa',
        context: { lead_id: 'lead-1' },
      }),
    });
    expect(ev.link).toBe('/tarefas');
    expect(ev.actor.name).toBe('Maria');
  });
});
