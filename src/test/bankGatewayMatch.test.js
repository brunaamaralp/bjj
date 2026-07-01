import { describe, expect, it } from 'vitest';
import {
  extractGatewayChargeIdFromBankItem,
  tryDeterministicGatewayMatch,
  isDeterministicGatewayMatch,
  RECONCILIATION_METHOD_GATEWAY,
} from '../lib/bankGatewayMatch.js';
import {
  matchBankItemsToTransactions,
  scoreBankItemToTx,
} from '../../lib/server/bankReconciliationMatcher.js';

function fakeTx(overrides = {}) {
  return {
    id: 'tx-1',
    gross: 150,
    net: 145,
    type: 'plan',
    status: 'settled',
    settledAt: '2026-06-01',
    bankAccount: 'Pagbank',
    reconciled: false,
    gateway_provider: 'pagbank',
    gateway_charge_id: 'CHAR_ABC123',
    ...overrides,
  };
}

describe('bankGatewayMatch', () => {
  it('extractGatewayChargeIdFromBankItem — campo explícito', () => {
    expect(extractGatewayChargeIdFromBankItem({ gateway_charge_id: 'char_abc' })).toBe('CHAR_ABC');
  });

  it('extractGatewayChargeIdFromBankItem — metadado EDI', () => {
    expect(
      extractGatewayChargeIdFromBankItem({
        description: 'Liquidação PagBank',
        metadata: { gateway_charge_id: 'PAY_XYZ' },
      })
    ).toBe('PAY_XYZ');
  });

  it('extractGatewayChargeIdFromBankItem — extrato tradicional sem ID', () => {
    expect(
      extractGatewayChargeIdFromBankItem({
        description: 'PIX RECEBIDO JOAO SILVA',
        amount: 150,
      })
    ).toBe('');
  });

  it('isDeterministicGatewayMatch — IDs iguais', () => {
    const item = { gateway_charge_id: 'CHAR_ABC123' };
    expect(isDeterministicGatewayMatch(item, fakeTx())).toBe(true);
  });

  it('tryDeterministicGatewayMatch — sucesso com campo em financial_tx', () => {
    const item = { gateway_charge_id: 'CHAR_ABC123', direction: 'credit', amount: 150 };
    const result = tryDeterministicGatewayMatch(item, [fakeTx()]);
    expect(result.kind).toBe('matched');
    expect(result.tx.id).toBe('tx-1');
    expect(result.reconciliation_method).toBe(RECONCILIATION_METHOD_GATEWAY);
  });

  it('tryDeterministicGatewayMatch — sem identificador', () => {
    const result = tryDeterministicGatewayMatch(
      { description: 'TED RECEBIDA', direction: 'credit', amount: 150 },
      [fakeTx()]
    );
    expect(result.kind).toBe('no_identifier');
  });

  it('tryDeterministicGatewayMatch — ambíguo (dois tx com mesmo charge)', () => {
    const item = { gateway_charge_id: 'CHAR_ABC123' };
    const pool = [fakeTx({ id: 'tx-a' }), fakeTx({ id: 'tx-b' })];
    expect(tryDeterministicGatewayMatch(item, pool).kind).toBe('ambiguous');
  });

  it('tryDeterministicGatewayMatch — lookup pagbank_payments', () => {
    const item = { gateway_charge_id: 'PAY_LOOKUP' };
    const pool = [fakeTx({ id: 'tx-mirror', gateway_charge_id: '' })];
    const lookup = { chargeIdToTxId: new Map([['PAY_LOOKUP', 'tx-mirror']]) };
    const result = tryDeterministicGatewayMatch(item, pool, lookup);
    expect(result.kind).toBe('matched');
    expect(result.via).toBe('pagbank_payment_lookup');
  });

  it('tryDeterministicGatewayMatch — lookup ambíguo cai para score', () => {
    const item = { gateway_charge_id: 'PAY_DUP' };
    const lookup = { chargeIdToTxId: new Map([['PAY_DUP', null]]) };
    expect(tryDeterministicGatewayMatch(item, [fakeTx()], lookup).kind).toBe('ambiguous');
  });
});

describe('bankReconciliationMatcher gateway integration', () => {
  it('match determinístico auto-concilia antes do score', () => {
    const [result] = matchBankItemsToTransactions(
      [
        {
          date: '2026-06-01',
          amount: 999,
          direction: 'credit',
          gateway_charge_id: 'CHAR_ABC123',
        },
      ],
      [fakeTx({ gross: 50, net: 50 })]
    );
    expect(result.status).toBe('matched');
    expect(result.gateway_auto_matched).toBe(true);
    expect(result.matched_tx_id).toBe('tx-1');
    expect(result.suggested_tx_id).toBeNull();
    expect(result.reconciliation_method).toBe(RECONCILIATION_METHOD_GATEWAY);
  });

  it('sem gateway id — usa score (sugestão, não auto-match)', () => {
    const [result] = matchBankItemsToTransactions(
      [{ date: '2026-06-01', amount: 150, direction: 'credit', bank_account: 'Pagbank' }],
      [fakeTx({ gross: 150, net: 150 })]
    );
    expect(result.status).toBe('unmatched');
    expect(result.gateway_auto_matched).toBeFalsy();
    expect(result.suggested_tx_id).toBe('tx-1');
  });

  it('scoreBankItemToTx retorna 100 para gateway match', () => {
    const score = scoreBankItemToTx(
      { gateway_charge_id: 'CHAR_ABC123', direction: 'credit', amount: 1 },
      fakeTx()
    );
    expect(score).toBe(100);
  });
});
