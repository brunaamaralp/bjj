import { describe, it, expect } from 'vitest';
import {
  parseCollectionRules,
  resolveCollectionStage,
  buildCollectionTaskDescription,
  parseCollectionTaskDescription,
  applyNamePlaceholder,
  DEFAULT_COLLECTION_RULES,
} from '../lib/collectionRules.js';
import { getPaymentRowStatus, isOverdueForCollection } from '../lib/collectionOverdue.js';

describe('collectionRules', () => {
  it('uses defaults when empty', () => {
    const rules = parseCollectionRules(null);
    expect(rules.length).toBe(DEFAULT_COLLECTION_RULES.length);
    expect(rules[0].day).toBe(1);
  });

  it('resolves stage by days overdue', () => {
    const rules = parseCollectionRules(null);
    expect(resolveCollectionStage(1, rules)?.day).toBe(1);
    expect(resolveCollectionStage(7, rules)?.day).toBe(7);
    expect(resolveCollectionStage(20, rules)?.day).toBe(15);
    expect(resolveCollectionStage(45, rules)?.day).toBe(30);
  });

  it('round-trips task description marker', () => {
    const desc = buildCollectionTaskDescription(
      { day: 7, label: '2ª tentativa', defaultMessage: 'Oi [nome]' },
      'Maria'
    );
    const parsed = parseCollectionTaskDescription(desc);
    expect(parsed?.day).toBe(7);
    expect(parsed?.stage).toBe('2ª tentativa');
    expect(parsed?.message).toContain('Maria');
  });

  it('replaces name placeholder', () => {
    expect(applyNamePlaceholder('Olá [nome]', 'João')).toBe('Olá João');
  });
});

describe('collectionOverdue', () => {
  const student = { dueDay: 5 };
  const month = '2026-05';

  it('marks pending when due day passed', () => {
    const today = new Date('2026-05-10T12:00:00');
    const row = getPaymentRowStatus(student, null, month, today);
    expect(row.status).toBe('pending');
    expect(row.daysOverdue).toBeGreaterThanOrEqual(1);
    expect(isOverdueForCollection(student, null, month, 1, today)).toBe(true);
  });

  it('is not overdue when paid', () => {
    const today = new Date('2026-05-10T12:00:00');
    const payment = { status: 'paid', paid_at: '2026-05-06' };
    const row = getPaymentRowStatus(student, payment, month, today);
    expect(row.status).toBe('paid');
    expect(isOverdueForCollection(student, payment, month, 1, today)).toBe(false);
  });
});
