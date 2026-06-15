import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  validateTxForBankReconciliation,
  amountsReconcileEqual,
  bankItemDirectionMatchesTx,
  bankItemAmountMatchesTx,
  reconciliationNoteWithJustification,
  RECON_AMOUNT_TOLERANCE,
} from '../../../lib/server/bankReconciliationValidation.js';
import { FINANCE_BANK_NOTE_PREFIX, FINANCE_CAT_NOTE_PREFIX } from '../../../lib/server/financeTxFields.js';

function fakeDoc({
  academyId = 'acad1',
  status = 'settled',
  reconciled = false,
  type = 'plan',
  gross = 100,
  net = 90,
  note = '',
  bank_account = 'Sicoob',
  $id = 'doc1',
} = {}) {
  return { $id, academyId, status, reconciled, type, gross, net, note, bank_account };
}

describe('bankReconciliationValidation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — amountsReconcileEqual', () => {
    it('100 vs 100 → true', () => {
      expect(amountsReconcileEqual(100, 100)).toBe(true);
    });

    it('100 vs 100.01 → true (dentro da tolerância 0.02)', () => {
      expect(amountsReconcileEqual(100, 100.01)).toBe(true);
      expect(RECON_AMOUNT_TOLERANCE).toBe(0.02);
    });

    it('100 vs 100.03 → false', () => {
      expect(amountsReconcileEqual(100, 100.03)).toBe(false);
    });

    it('0 vs 0 → true', () => {
      expect(amountsReconcileEqual(0, 0)).toBe(true);
    });
  });

  describe('BLOCO 2 — bankItemDirectionMatchesTx / bankItemAmountMatchesTx', () => {
    const planTx = fakeDoc({ type: 'plan' });
    const expenseTx = fakeDoc({ type: 'expense_operational', gross: 50, net: -50 });

    it("item credit + tx type='plan' → direção ok (true)", () => {
      expect(bankItemDirectionMatchesTx({ direction: 'credit' }, planTx)).toBe(true);
    });

    it("item debit + tx type='plan' → direção errada (false)", () => {
      expect(bankItemDirectionMatchesTx({ direction: 'debit' }, planTx)).toBe(false);
    });

    it("item credit + tx type='expense_operational' → direção errada (false)", () => {
      expect(bankItemDirectionMatchesTx({ direction: 'credit' }, expenseTx)).toBe(false);
    });

    it('item amount=100 + tx gross=100 → amount ok (true)', () => {
      expect(bankItemAmountMatchesTx({ amount: 100 }, planTx)).toBe(true);
    });

    it('item amount=100 + tx gross=200 → amount errado (false)', () => {
      expect(bankItemAmountMatchesTx({ amount: 100 }, { ...planTx, gross: 200, net: 200 })).toBe(
        false
      );
    });

    it('item amount=90 + tx net=90 (gross=100) → ok via net (true)', () => {
      expect(bankItemAmountMatchesTx({ amount: 90 }, planTx)).toBe(true);
    });
  });

  describe('BLOCO 3 — validateTxForBankReconciliation', () => {
    const compatibleItem = { amount: 100, direction: 'credit', bank_account: 'Sicoob' };

    it('doc válido, academyId correto, item compatível → { ok:true, mapped: {...} }', () => {
      const doc = fakeDoc({ gross: 100, net: 100 });
      const result = validateTxForBankReconciliation(doc, {
        academyId: 'acad1',
        item: compatibleItem,
      });
      expect(result.ok).toBe(true);
      expect(result.mapped).toBeTruthy();
      expect(result.mapped.id).toBe('doc1');
    });

    it("academyId errado → { ok:false, error:'forbidden' }", () => {
      const result = validateTxForBankReconciliation(fakeDoc(), {
        academyId: 'outro',
        item: compatibleItem,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('forbidden');
    });

    it("status='pending' → { ok:false, error:'tx_not_settled' }", () => {
      const result = validateTxForBankReconciliation(fakeDoc({ status: 'pending' }), {
        academyId: 'acad1',
        item: compatibleItem,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('tx_not_settled');
    });

    it("reconciled=true sem allowAlreadyReconciled → { ok:false, error:'tx_already_reconciled' }", () => {
      const result = validateTxForBankReconciliation(fakeDoc({ reconciled: true }), {
        academyId: 'acad1',
        item: compatibleItem,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('tx_already_reconciled');
    });

    it('reconciled=true com allowAlreadyReconciled=true → ok', () => {
      const result = validateTxForBankReconciliation(fakeDoc({ reconciled: true, gross: 100, net: 100 }), {
        academyId: 'acad1',
        item: compatibleItem,
        allowAlreadyReconciled: true,
      });
      expect(result.ok).toBe(true);
    });

    it("item direction incompatível → { ok:false, error:'direction_mismatch' }", () => {
      const result = validateTxForBankReconciliation(fakeDoc({ gross: 100, net: 100 }), {
        academyId: 'acad1',
        item: { ...compatibleItem, direction: 'debit' },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('direction_mismatch');
    });

    it("item amount incompatível → { ok:false, error:'amount_mismatch' }", () => {
      const result = validateTxForBankReconciliation(fakeDoc({ gross: 100, net: 100 }), {
        academyId: 'acad1',
        item: { ...compatibleItem, amount: 50 },
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('amount_mismatch');
    });

    it("bank_account mismatch → { ok:false, error:'bank_account_mismatch' }", () => {
      const result = validateTxForBankReconciliation(
        fakeDoc({ gross: 100, net: 100, bank_account: 'Nubank' }),
        {
          academyId: 'acad1',
          item: compatibleItem,
        }
      );
      expect(result.ok).toBe(false);
      expect(result.error).toBe('bank_account_mismatch');
    });

    it('skipAmountCheck=true → ignora direction/amount/bank', () => {
      const result = validateTxForBankReconciliation(fakeDoc({ gross: 100, net: 100 }), {
        academyId: 'acad1',
        item: { amount: 1, direction: 'debit', bank_account: 'Outro' },
        skipAmountCheck: true,
      });
      expect(result.ok).toBe(true);
    });

    it("doc null → { ok:false, error:'tx_not_found' }", () => {
      const result = validateTxForBankReconciliation(null, { academyId: 'acad1' });
      expect(result.ok).toBe(false);
      expect(result.error).toBe('tx_not_found');
    });
  });

  describe('BLOCO 4 — reconciliationNoteWithJustification', () => {
    it('justificativa válida → note contém o texto', () => {
      const note = reconciliationNoteWithJustification(fakeDoc({ note: 'obs' }), 'Conciliado manual');
      expect(note).toContain('Conciliado manual');
    });

    it('justificativa vazia → retorna null', () => {
      expect(reconciliationNoteWithJustification(fakeDoc(), '')).toBeNull();
      expect(reconciliationNoteWithJustification(fakeDoc(), '   ')).toBeNull();
    });

    it('doc com @cat: e @bank: na note → preserva prefixos no resultado', () => {
      const prevDoc = {
        type: 'plan',
        note: `${FINANCE_CAT_NOTE_PREFIX}Mensalidades\n${FINANCE_BANK_NOTE_PREFIX}Sicoob\nObs original`,
      };
      const merged = reconciliationNoteWithJustification(prevDoc, 'Justificativa');
      expect(merged).toContain(`${FINANCE_CAT_NOTE_PREFIX}Mensalidades`);
      expect(merged).toContain(`${FINANCE_BANK_NOTE_PREFIX}Sicoob`);
      expect(merged).toContain('Obs original');
      expect(merged).toContain('Justificativa');
    });
  });
});
