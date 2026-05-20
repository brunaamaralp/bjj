import { describe, it, expect } from 'vitest';
import { isCollectionSnoozed } from '../lib/collectionRules.js';
import { expectedAmountWithCardFee } from '../lib/paymentStatus.js';

describe('isCollectionSnoozed', () => {
  it('retorna true quando mês de snooze coincide com referência', () => {
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    const ym = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}`;
    const until = new Date(future.getFullYear(), future.getMonth() + 1, 0, 23, 59, 59).toISOString();
    expect(isCollectionSnoozed({ collection_snooze_month: ym, collection_snooze_until: until }, ym)).toBe(
      true
    );
  });

  it('retorna false para outro mês', () => {
    expect(isCollectionSnoozed({ collection_snooze_month: '2025-06' }, '2025-07')).toBe(false);
  });
});

describe('expectedAmountWithCardFee', () => {
  const financeConfig = {
    plans: [{ name: 'Mensal', price: 200, applyCardFee: true }],
    cardFees: {
      credito_avista: { percent: 5 },
      debito: { percent: 2 },
      credito_parcelado: { 3: 8 },
    },
  };

  it('aplica taxa no cartão quando applyCardFee', () => {
    const student = { plan: 'Mensal' };
    expect(expectedAmountWithCardFee(student, financeConfig, 'credito', null, null)).toBe(210);
    expect(expectedAmountWithCardFee(student, financeConfig, 'debito', null, null)).toBe(204);
  });

  it('não aplica taxa em pix', () => {
    const student = { plan: 'Mensal' };
    expect(expectedAmountWithCardFee(student, financeConfig, 'pix', null, null)).toBe(200);
  });

  it('não aplica quando plano sem applyCardFee', () => {
    const cfg = { ...financeConfig, plans: [{ name: 'Mensal', price: 200, applyCardFee: false }] };
    expect(expectedAmountWithCardFee({ plan: 'Mensal' }, cfg, 'credito', null, null)).toBe(200);
  });
});
