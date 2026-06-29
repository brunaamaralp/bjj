import { describe, it, expect } from 'vitest';
import {
  hasBrandFeeDivergence,
  pickFeeRow,
  normalizeFeeReceiver,
  feeReceiversAcquirerConfigured,
  feeReceiversSettingsSummary,
  countFeeReceiverUsages,
  canRemoveFeeReceiver,
} from '../lib/feeReceivers.js';

const receiver = normalizeFeeReceiver({
  id: 'recv_1',
  name: 'PagBank',
  bankAccountLabel: 'Pagbank',
  active: true,
  useDefaultFees: false,
  fees: {
    pix: { percent: 0, fixed: 0 },
    debito: {
      default: { percent: 1.99, fixed: 0 },
      visa: { percent: 1.79, fixed: 0 },
      mastercard: { percent: 1.89, fixed: 0 },
    },
    credito_avista: { default: { percent: 0, fixed: 0 } },
    credito_parcelado: {},
    antecipacao: { percent: 0, fixed: 0 },
  },
});

describe('hasBrandFeeDivergence', () => {
  it('true quando visa != master', () => {
    expect(hasBrandFeeDivergence(receiver, 'cartao_debito', 1)).toBe(true);
  });

  it('false quando só default preenchido', () => {
    const r = normalizeFeeReceiver({
      ...receiver,
      fees: {
        ...receiver.fees,
        debito: { default: { percent: 2, fixed: 0 } },
      },
    });
    expect(hasBrandFeeDivergence(r, 'cartao_debito', 1)).toBe(false);
  });
});

describe('pickFeeRow', () => {
  it('usa visa quando informado', () => {
    const row = pickFeeRow(receiver.fees, 'cartao_debito', 1, 'visa');
    expect(row.percent).toBe(1.79);
  });

  it('fallback default', () => {
    const row = pickFeeRow(receiver.fees, 'cartao_debito', 1, '');
    expect(row.percent).toBe(1.99);
  });
});

describe('fee receiver settings helpers', () => {
  const financeConfig = {
    defaultFeeReceiverId: 'recv_1',
    feeReceivers: [receiver, normalizeFeeReceiver({ id: 'recv_2', name: 'Asaas', useDefaultFees: false, fees: receiver.fees })],
    bankAccounts: [{ bankName: 'BB', feeReceiverId: 'recv_2' }],
    captureMethods: [{ id: 'cap_1', feeReceiverId: 'recv_1' }],
  };

  it('feeReceiversAcquirerConfigured detects configured fees', () => {
    expect(feeReceiversAcquirerConfigured(financeConfig)).toBe(true);
    expect(feeReceiversAcquirerConfigured({ feeReceivers: [] })).toBe(false);
  });

  it('feeReceiversSettingsSummary includes name and count', () => {
    const summary = feeReceiversSettingsSummary(financeConfig);
    expect(summary).toContain('PagBank');
    expect(summary).toContain('2 recebedores');
  });

  it('countFeeReceiverUsages counts links', () => {
    expect(countFeeReceiverUsages(financeConfig, 'recv_1')).toEqual({
      bankAccounts: 0,
      captureMethods: 1,
    });
    expect(countFeeReceiverUsages(financeConfig, 'recv_2')).toEqual({
      bankAccounts: 1,
      captureMethods: 0,
    });
  });

  it('canRemoveFeeReceiver blocks last receiver', () => {
    expect(canRemoveFeeReceiver({ feeReceivers: [receiver] }, 'recv_1')).toEqual({
      ok: false,
      reason: 'last_receiver',
    });
    expect(canRemoveFeeReceiver(financeConfig, 'recv_1').ok).toBe(true);
  });
});
