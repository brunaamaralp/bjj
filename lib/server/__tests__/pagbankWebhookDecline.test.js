import { describe, expect, it } from 'vitest';
import {
  extractInvoiceContext,
  parsePagbankMaxRetries,
  resolveAcademyMaxRetries,
  resolveDeclineOutcome,
} from '../pagbankWebhookDecline.js';
import { extractWebhookFields, mapOfficialEventType } from '../pagbankWebhookHandler.js';

describe('pagbankWebhookDecline', () => {
  it('parsePagbankMaxRetries counts first_try/second_try/third_try', () => {
    expect(parsePagbankMaxRetries({ first_try: '3', second_try: '5' })).toBe(2);
    expect(parsePagbankMaxRetries({ first_try: '1', second_try: '3', third_try: '7' })).toBe(3);
    expect(parsePagbankMaxRetries({})).toBe(3);
    expect(parsePagbankMaxRetries({ max_retries: 5 })).toBe(5);
  });

  it('resolveAcademyMaxRetries falls back to 3', () => {
    expect(resolveAcademyMaxRetries({})).toBe(3);
    expect(resolveAcademyMaxRetries({ pagbank_max_retries: 5 })).toBe(5);
  });

  it('resolveDeclineOutcome — primeira tentativa → retrying', () => {
    const out = resolveDeclineOutcome({ priorDeclinedCount: 0, maxRetries: 3, invoiceStatus: '' });
    expect(out.attemptNumber).toBe(1);
    expect(out.isFinalAttempt).toBe(false);
    expect(out.subscriptionStatus).toBe('retrying');
  });

  it('resolveDeclineOutcome — terceira tentativa com max 3 → overdue', () => {
    const out = resolveDeclineOutcome({ priorDeclinedCount: 2, maxRetries: 3, invoiceStatus: '' });
    expect(out.attemptNumber).toBe(3);
    expect(out.isFinalAttempt).toBe(true);
    expect(out.subscriptionStatus).toBe('overdue');
  });

  it('resolveDeclineOutcome — tentativa 3 com max 5 ainda retrying', () => {
    const out = resolveDeclineOutcome({ priorDeclinedCount: 2, maxRetries: 5, invoiceStatus: '' });
    expect(out.attemptNumber).toBe(3);
    expect(out.isFinalAttempt).toBe(false);
    expect(out.subscriptionStatus).toBe('retrying');
  });

  it('resolveDeclineOutcome — PENDING_ACTION na primeira → final', () => {
    const out = resolveDeclineOutcome({
      priorDeclinedCount: 0,
      maxRetries: 3,
      invoiceStatus: 'PENDING_ACTION',
    });
    expect(out.attemptNumber).toBe(1);
    expect(out.isFinalAttempt).toBe(true);
    expect(out.subscriptionStatus).toBe('overdue');
  });
});

describe('extractInvoiceContext', () => {
  it('lê invoice aninhada em body.data', () => {
    const ctx = extractInvoiceContext({
      data: {
        invoice: { id: 'INVO_1', status: 'OVERDUE' },
      },
    });
    expect(ctx.invoiceId).toBe('INVO_1');
    expect(ctx.invoiceStatus).toBe('OVERDUE');
  });

  it('formato oficial sem invoice retorna vazio', () => {
    const ctx = extractInvoiceContext({
      event: 'subscription.recurrence',
      resource: { id: 'SUBS_1', status: 'OVERDUE' },
    });
    expect(ctx.invoiceId).toBe('');
    expect(ctx.invoiceStatus).toBe('');
  });
});

describe('extractWebhookFields', () => {
  it('mapeia subscription.recurrence OVERDUE para declined', () => {
    const fields = extractWebhookFields({
      id: 'evt-1',
      event: 'subscription.recurrence',
      resource: {
        id: 'SUBS_1',
        status: 'OVERDUE',
        amount: { value: 15000 },
        updated_at: '2026-03-01T10:00:00.000-03:00',
      },
    });
    expect(fields.eventType).toBe('subscription.payment.declined');
    expect(fields.subscriptionId).toBe('SUBS_1');
  });

  it('mapOfficialEventType trata PENDING_ACTION como declined', () => {
    expect(mapOfficialEventType('subscription.recurrence', 'PENDING_ACTION')).toBe(
      'subscription.payment.declined'
    );
  });
});
