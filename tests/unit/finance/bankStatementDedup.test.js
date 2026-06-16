import { describe, expect, it } from 'vitest';
import {
  amountsEqualRecon,
  bankAccountsCompatibleForDedup,
  bankStatementItemFingerprint,
  buildDedupIndex,
  classifyImportItem,
  itemsAreDuplicates,
  originalStatusEligibleForDedup,
  statementPeriodsOverlap,
} from '../../../lib/server/bankStatementDedup.js';

describe('bankStatementDedup', () => {
  describe('amountsEqualRecon', () => {
    it('treats values within 0.02 as equal', () => {
      expect(amountsEqualRecon(100, 100.01)).toBe(true);
    });

    it('rejects values beyond tolerance', () => {
      expect(amountsEqualRecon(100, 100.03)).toBe(false);
    });
  });

  describe('bankAccountsCompatibleForDedup', () => {
    it('same account → compatible', () => {
      expect(bankAccountsCompatibleForDedup('Sicoob', 'sicoob')).toBe(true);
    });

    it('different accounts → incompatible', () => {
      expect(bankAccountsCompatibleForDedup('Sicoob', 'Nubank')).toBe(false);
    });

    it('new with account, existing without → incompatible', () => {
      expect(bankAccountsCompatibleForDedup('Sicoob', '')).toBe(false);
    });

    it('both empty → compatible', () => {
      expect(bankAccountsCompatibleForDedup('', '')).toBe(true);
    });
  });

  describe('itemsAreDuplicates', () => {
    const base = { date: '2026-01-10', amount: 100, direction: 'credit', bank_account: 'Sicoob' };

    it('matching fingerprint → duplicate', () => {
      expect(
        itemsAreDuplicates(base, { ...base, status: 'matched' }, {
          newStatementBank: 'Sicoob',
          existingStatementBank: 'Sicoob',
        })
      ).toBe(true);
    });

    it('different direction → not duplicate', () => {
      expect(itemsAreDuplicates(base, { ...base, direction: 'debit' })).toBe(false);
    });

    it('ambiguous bank (new has account, existing none) → not duplicate', () => {
      expect(
        itemsAreDuplicates(
          { ...base, bank_account: 'Sicoob' },
          { date: '2026-01-10', amount: 100, direction: 'credit' },
          { newStatementBank: 'Sicoob', existingStatementBank: '' }
        )
      ).toBe(false);
    });
  });

  describe('originalStatusEligibleForDedup', () => {
    it('matched and ignored are eligible', () => {
      expect(originalStatusEligibleForDedup('matched')).toBe(true);
      expect(originalStatusEligibleForDedup('ignored')).toBe(true);
    });

    it('unmatched and duplicate are not eligible', () => {
      expect(originalStatusEligibleForDedup('unmatched')).toBe(false);
      expect(originalStatusEligibleForDedup('duplicate')).toBe(false);
    });
  });

  describe('buildDedupIndex + classifyImportItem', () => {
    const existing = [
      {
        id: 'item-a1',
        statement_id: 'st-a',
        date: '2026-01-10',
        amount: 100,
        direction: 'credit',
        status: 'matched',
        statement_bank: 'Sicoob',
      },
      {
        id: 'item-a2',
        statement_id: 'st-a',
        date: '2026-01-11',
        amount: 50,
        direction: 'debit',
        status: 'unmatched',
        statement_bank: 'Sicoob',
      },
    ];

    it('classifies duplicate when original was matched', () => {
      const index = buildDedupIndex(existing);
      const result = classifyImportItem(
        { date: '2026-01-10', amount: 100, direction: 'credit', bank_account: 'Sicoob' },
        index,
        { newStatementBank: 'Sicoob', existingItems: existing }
      );
      expect(result).toEqual({ status: 'duplicate', duplicate_of: 'item-a1' });
    });

    it('does not classify when original is still unmatched', () => {
      const index = buildDedupIndex(existing);
      const result = classifyImportItem(
        { date: '2026-01-11', amount: 50, direction: 'debit', bank_account: 'Sicoob' },
        index,
        { newStatementBank: 'Sicoob', existingItems: existing }
      );
      expect(result).toBeNull();
    });

    it('new line with no prior match → null', () => {
      const index = buildDedupIndex(existing);
      const result = classifyImportItem(
        { date: '2026-01-20', amount: 200, direction: 'credit', bank_account: 'Sicoob' },
        index,
        { newStatementBank: 'Sicoob', existingItems: existing }
      );
      expect(result).toBeNull();
    });
  });

  describe('statementPeriodsOverlap', () => {
    it('Jan 1-30 overlaps Jan 1-15', () => {
      expect(statementPeriodsOverlap('2026-01-01', '2026-01-30', '2026-01-01', '2026-01-15')).toBe(true);
    });

    it('Jan 16-31 does not overlap Jan 1-15', () => {
      expect(statementPeriodsOverlap('2026-01-16', '2026-01-31', '2026-01-01', '2026-01-15')).toBe(false);
    });
  });

  describe('bankStatementItemFingerprint', () => {
    it('normalizes bank case', () => {
      const a = bankStatementItemFingerprint({ date: '2026-01-01', amount: 10, direction: 'credit', bank_account: 'SICOOB' });
      const b = bankStatementItemFingerprint({ date: '2026-01-01', amount: 10, direction: 'credit', bank_account: 'sicoob' });
      expect(a).toBe(b);
    });
  });
});
