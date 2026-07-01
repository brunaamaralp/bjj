import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  scoreBankItemToTx,
  bankAccountMatchLevel,
  matchBankItemsToTransactions,
  partitionMatchResults,
  txEligibleForStatementBank,
  BANK_MATCH_SUGGEST_SCORE,
} from '../../../lib/server/bankReconciliationMatcher.js';

function fakeTx({
  id = 'tx1',
  gross = 100,
  net = 90,
  type = 'plan',
  status = 'settled',
  settledAt = '2025-06-01',
  bankAccount = 'Sicoob',
  reconciled = false,
  gateway_provider = '',
  gateway_charge_id = '',
} = {}) {
  return {
    id,
    gross,
    net,
    type,
    status,
    settledAt,
    bankAccount,
    reconciled,
    gateway_provider,
    gateway_charge_id,
  };
}

function fakeItem({
  date = '2025-06-01',
  amount = 100,
  direction = 'credit',
  bank_account = 'Sicoob',
  gateway_charge_id = '',
} = {}) {
  return { date, amount, direction, bank_account, gateway_charge_id };
}

describe('bankReconciliationMatcher', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — bankAccountMatchLevel', () => {
    it("itemBank='sicoob', txBank='sicoob' → 'ok'", () => {
      expect(bankAccountMatchLevel('sicoob', 'sicoob')).toBe('ok');
    });

    it("itemBank='sicoob', txBank='nubank' → 'mismatch'", () => {
      expect(bankAccountMatchLevel('sicoob', 'nubank')).toBe('mismatch');
    });

    it("itemBank='sicoob', txBank='' → 'partial'", () => {
      expect(bankAccountMatchLevel('sicoob', '')).toBe('partial');
    });

    it("itemBank='', txBank='sicoob' → 'ok' (item sem banco não restringe)", () => {
      expect(bankAccountMatchLevel('', 'sicoob')).toBe('ok');
    });
  });

  describe('BLOCO 2 — scoreBankItemToTx', () => {
    it('item credit, tx plan, mesmo valor, mesmo dia → score >= 100', () => {
      const score = scoreBankItemToTx(fakeItem({ amount: 100 }), fakeTx({ gross: 100, net: 100 }));
      expect(score).toBeGreaterThanOrEqual(100);
    });

    it('item credit, tx plan, mesmo valor, 1 dia diferença → score 85', () => {
      const score = scoreBankItemToTx(
        fakeItem({ date: '2025-06-02', amount: 100 }),
        fakeTx({ settledAt: '2025-06-01', gross: 100, net: 100 })
      );
      expect(score).toBe(85);
    });

    it('item credit, tx plan, mesmo valor, 3 dias diferença → score 70', () => {
      const score = scoreBankItemToTx(
        fakeItem({ date: '2025-06-04', amount: 100 }),
        fakeTx({ settledAt: '2025-06-01', gross: 100, net: 100 })
      );
      expect(score).toBe(70);
    });

    it('item credit, tx plan, mesmo valor, 4 dias diferença → score 0 (além do limite)', () => {
      const score = scoreBankItemToTx(
        fakeItem({ date: '2025-06-05', amount: 100 }),
        fakeTx({ settledAt: '2025-06-01', gross: 100, net: 100 })
      );
      expect(score).toBe(0);
    });

    it('item debit, tx plan (direction in) → score 0 (direção incompatível)', () => {
      const score = scoreBankItemToTx(
        fakeItem({ direction: 'debit', amount: 100 }),
        fakeTx({ type: 'plan', gross: 100, net: 100 })
      );
      expect(score).toBe(0);
    });

    it('item credit, tx expense_operational (direction out) → score 0', () => {
      const score = scoreBankItemToTx(
        fakeItem({ direction: 'credit', amount: 50 }),
        fakeTx({ type: 'expense_operational', gross: 50, net: -50 })
      );
      expect(score).toBe(0);
    });

    it('bank_account mismatch → score 0', () => {
      const score = scoreBankItemToTx(
        fakeItem({ bank_account: 'Sicoob', amount: 100 }),
        fakeTx({ bankAccount: 'Nubank', gross: 100, net: 100 })
      );
      expect(score).toBe(0);
    });

    it('bank_account partial (tx sem banco) → score <= 50', () => {
      const score = scoreBankItemToTx(
        fakeItem({ bank_account: 'Sicoob', amount: 100 }),
        fakeTx({ bankAccount: '', gross: 100, net: 100 })
      );
      expect(score).toBeLessThanOrEqual(50);
      expect(score).toBeGreaterThan(0);
    });

    it('gateway_charge_id match → score 100', () => {
      const score = scoreBankItemToTx(
        fakeItem({ gateway_charge_id: 'CHAR_X', amount: 1 }),
        fakeTx({ gateway_provider: 'pagbank', gateway_charge_id: 'CHAR_X', gross: 999, net: 999 })
      );
      expect(score).toBe(100);
    });
  });

  describe('BLOCO 3 — matchBankItemsToTransactions', () => {
    it('1 item + 1 tx com score alto → suggested_tx_id preenchido', () => {
      const [result] = matchBankItemsToTransactions([fakeItem({ amount: 100 })], [
        fakeTx({ id: 'tx-match', gross: 100, net: 100 }),
      ]);
      expect(result.suggested_tx_id).toBe('tx-match');
      expect(result.match_score).toBeGreaterThanOrEqual(BANK_MATCH_SUGGEST_SCORE);
    });

    it('1 item + 1 tx reconciled=true → tx ignorada, sem match', () => {
      const [result] = matchBankItemsToTransactions([fakeItem()], [
        fakeTx({ reconciled: true }),
      ]);
      expect(result.suggested_tx_id).toBeNull();
      expect(result.match_score).toBe(0);
    });

    it('1 item + 1 tx pending → tx ignorada (só settled)', () => {
      const [result] = matchBankItemsToTransactions([fakeItem()], [
        fakeTx({ status: 'pending' }),
      ]);
      expect(result.suggested_tx_id).toBeNull();
      expect(result.match_score).toBe(0);
    });

    it('2 itens + 1 tx → ambos podem sugerir a mesma tx (pool não marca uso)', () => {
      const results = matchBankItemsToTransactions(
        [fakeItem({ amount: 100 }), fakeItem({ date: '2025-06-02', amount: 100 })],
        [fakeTx({ id: 'tx-shared', gross: 100, net: 100 })]
      );
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.suggested_tx_id === 'tx-shared')).toBe(true);
    });

    it("item sem tx compatível → status='unmatched', suggested_tx_id=null", () => {
      const [result] = matchBankItemsToTransactions(
        [fakeItem({ direction: 'debit', amount: 100 })],
        [fakeTx({ type: 'plan', gross: 100, net: 100 })]
      );
      expect(result.status).toBe('unmatched');
      expect(result.suggested_tx_id).toBeNull();
    });
  });

  describe('BLOCO 4 — txEligibleForStatementBank', () => {
    it('extrato sem conta → todos os lançamentos elegíveis', () => {
      const tx = fakeTx({ bankAccount: 'Nubank' });
      expect(txEligibleForStatementBank('', tx)).toBe(true);
      expect(txEligibleForStatementBank(null, tx)).toBe(true);
    });

    it('mesma conta (ok) → elegível', () => {
      const tx = fakeTx({ bankAccount: 'Sicoob' });
      expect(txEligibleForStatementBank('Sicoob', tx)).toBe(true);
    });

    it('lançamento sem conta (partial) → elegível', () => {
      const tx = fakeTx({ bankAccount: '' });
      expect(txEligibleForStatementBank('Sicoob', tx)).toBe(true);
    });

    it('contas diferentes (mismatch) → não elegível', () => {
      const tx = fakeTx({ bankAccount: 'Nubank' });
      expect(txEligibleForStatementBank('Sicoob', tx)).toBe(false);
    });

    it('comparação case-insensitive', () => {
      const tx = fakeTx({ bankAccount: 'SICOOB' });
      expect(txEligibleForStatementBank('sicoob', tx)).toBe(true);
    });
  });

  describe('BLOCO 5 — partitionMatchResults', () => {
    it("resultado com status='matched' → vai para auto", () => {
      const { auto, suggested, unmatched } = partitionMatchResults([
        { status: 'matched', match_score: 100, suggested_tx_id: 'tx1' },
      ]);
      expect(auto).toHaveLength(1);
      expect(suggested).toHaveLength(0);
      expect(unmatched).toHaveLength(0);
    });

    it('resultado com score >= BANK_MATCH_SUGGEST_SCORE e suggested_tx_id → vai para suggested', () => {
      const { auto, suggested, unmatched } = partitionMatchResults([
        {
          status: 'unmatched',
          match_score: BANK_MATCH_SUGGEST_SCORE,
          suggested_tx_id: 'tx1',
        },
      ]);
      expect(auto).toHaveLength(0);
      expect(suggested).toHaveLength(1);
      expect(unmatched).toHaveLength(0);
    });

    it('resultado sem match → vai para unmatched', () => {
      const { auto, suggested, unmatched } = partitionMatchResults([
        { status: 'unmatched', match_score: 0, suggested_tx_id: null },
      ]);
      expect(auto).toHaveLength(0);
      expect(suggested).toHaveLength(0);
      expect(unmatched).toHaveLength(1);
    });
  });
});
