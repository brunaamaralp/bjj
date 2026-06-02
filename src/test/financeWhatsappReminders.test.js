import { describe, it, expect } from 'vitest';
import {
  normalizeWhatsappRemindersConfig,
  applyFinanceReminderPlaceholders,
  addDaysToYmd,
  paymentDueDateKey,
  isPaymentEligibleForWhatsappReminder,
  DEFAULT_WHATSAPP_REMINDER_MESSAGES,
} from '../lib/financeWhatsappReminders.js';

describe('financeWhatsappReminders', () => {
  it('normalizes days within 1–7', () => {
    const cfg = normalizeWhatsappRemindersConfig({
      dueSoon: { enabled: true, daysBefore: 99, message: 'x' },
      overdue: { enabled: true, daysAfter: 0, message: 'y' },
    });
    expect(cfg.dueSoon.daysBefore).toBe(7);
    expect(cfg.overdue.daysAfter).toBe(1);
  });

  it('applies placeholders', () => {
    const text = applyFinanceReminderPlaceholders(DEFAULT_WHATSAPP_REMINDER_MESSAGES.dueSoon, {
      nome: 'Ana',
      valor: 'R$ 150,00',
      vencimento: '05/06/2026',
      plano: 'Mensal',
      academia: 'Dojo',
    });
    expect(text).toContain('Ana');
    expect(text).toContain('R$ 150,00');
    expect(text).toContain('05/06/2026');
  });

  it('addDaysToYmd shifts calendar days', () => {
    expect(addDaysToYmd('2026-06-02', 3)).toBe('2026-06-05');
    expect(addDaysToYmd('2026-06-02', -3)).toBe('2026-05-30');
  });

  it('paymentDueDateKey uses due_date', () => {
    expect(paymentDueDateKey({ due_date: '2026-06-05T00:00:00.000Z' })).toBe('2026-06-05');
  });

  it('eligible statuses are pending and awaiting', () => {
    expect(isPaymentEligibleForWhatsappReminder({ status: 'pending' })).toBe(true);
    expect(isPaymentEligibleForWhatsappReminder({ status: 'awaiting' })).toBe(true);
    expect(isPaymentEligibleForWhatsappReminder({ status: 'paid' })).toBe(false);
  });
});
