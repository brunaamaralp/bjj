import { describe, it, expect } from 'vitest';
import { sanitizePaymentUpdatesForNl } from '../../lib/paymentNlUpdates.js';

describe('sanitizePaymentUpdatesForNl', () => {
  it('aceita updates.note e corta excesso', () => {
    const out = sanitizePaymentUpdatesForNl({
      updates: { note: '  ok  ', account: '', plan_name: '' }
    });
    expect(out).toEqual({ note: 'ok' });
  });

  it('aceita chaves flat no objeto raiz', () => {
    expect(
      sanitizePaymentUpdatesForNl({
        account: '  Nubank ',
        plan_name: ' Kimono ',
        note: ''
      })
    ).toEqual({ account: 'Nubank', plan_name: 'Kimono' });
  });

  it('ignora chaves não permitidas e objetos vazios', () => {
    expect(
      sanitizePaymentUpdatesForNl({
        updates: { note: 'a', amount: 999, status: 'paid' }
      })
    ).toEqual({ note: 'a' });
  });

  it('retorna vazio se nada válido', () => {
    expect(sanitizePaymentUpdatesForNl({ updates: { foo: 'x' } })).toEqual({});
  });
});
