import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normalizeTxAmounts,
  txDirection,
  isExpenseType,
  isOutflowType,
  financeNoteForStorage,
  financeUserNoteFromStored,
  financeBankAccountFromDoc,
  financeCategoryLabelFromDoc,
  normalizeRecurrenceType,
  normalizeRecurrenceDay,
  parseRecurrenceEnd,
  mapFinanceTxDoc,
  financeTxDocumentForAppwrite,
} from '../../../lib/server/financeTxFields.js';

describe('financeTxFields', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('BLOCO 1 — isExpenseType / txDirection', () => {
    it("'expense_operational' → isExpenseType true", () => {
      expect(isExpenseType('expense_operational')).toBe(true);
    });

    it("'card_fee' → isExpenseType true", () => {
      expect(isExpenseType('card_fee')).toBe(true);
    });

    it("'plan' → isExpenseType false", () => {
      expect(isExpenseType('plan')).toBe(false);
    });

    it("doc com type='expense_operational' → txDirection 'out'", () => {
      expect(txDirection({ type: 'expense_operational' })).toBe('out');
    });

    it("doc com type='plan' → txDirection 'in'", () => {
      expect(txDirection({ type: 'plan' })).toBe('in');
    });

    it("doc com direction='out' explícito → txDirection 'out' (independente do type)", () => {
      expect(txDirection({ type: 'plan', direction: 'out' })).toBe('out');
    });

    it('isOutflowType espelha isExpenseType', () => {
      expect(isOutflowType('expense')).toBe(isExpenseType('expense'));
      expect(isOutflowType('plan')).toBe(isExpenseType('plan'));
    });
  });

  describe('BLOCO 2 — normalizeTxAmounts', () => {
    it("type='plan', gross=100, fee=5 → { gross:100, fee:5, net:95, direction:'in' }", () => {
      expect(normalizeTxAmounts({ type: 'plan', gross: 100, fee: 5 })).toEqual({
        gross: 100,
        fee: 5,
        net: 95,
        direction: 'in',
      });
    });

    it("type='expense_operational', gross=50 → { gross:50, fee:0, net:-50, direction:'out' }", () => {
      expect(normalizeTxAmounts({ type: 'expense_operational', gross: 50 })).toEqual({
        gross: 50,
        fee: 0,
        net: -50,
        direction: 'out',
      });
    });

    it("type='refund', gross=30 → { gross:30, fee:0, net:-30, direction:'in' }", () => {
      expect(normalizeTxAmounts({ type: 'refund', gross: 30 })).toEqual({
        gross: 30,
        fee: 0,
        net: -30,
        direction: 'in',
      });
    });

    it('gross=0 → lança Error(valor_invalido)', () => {
      expect(() => normalizeTxAmounts({ type: 'plan', gross: 0 })).toThrow('valor_invalido');
    });

    it('gross=6000000 → lança Error(valor_acima_do_limite)', () => {
      expect(() => normalizeTxAmounts({ type: 'plan', gross: 6_000_000 })).toThrow(
        'valor_acima_do_limite'
      );
    });

    it('fee > gross → net = 0 (não negativo para receita)', () => {
      const result = normalizeTxAmounts({ type: 'plan', gross: 50, fee: 80 });
      expect(result.net).toBe(0);
      expect(result.direction).toBe('in');
    });
  });

  describe('BLOCO 3 — note helpers', () => {
    it("financeNoteForStorage('Mensalidades', 'obs do usuário', 'Sicoob') prefixa @cat e @bank", () => {
      const note = financeNoteForStorage('Mensalidades', 'obs do usuário', 'Sicoob');
      expect(note).toBe('@cat:Mensalidades\n@bank:Sicoob\nobs do usuário');
    });

    it("financeUserNoteFromStored('@cat:Mensalidades\\n@bank:Sicoob\\nnota') → 'nota'", () => {
      expect(financeUserNoteFromStored('@cat:Mensalidades\n@bank:Sicoob\nnota')).toBe('nota');
    });

    it("financeBankAccountFromDoc({bank_account:'Sicoob'}) → 'Sicoob'", () => {
      expect(financeBankAccountFromDoc({ bank_account: 'Sicoob' })).toBe('Sicoob');
    });

    it("financeBankAccountFromDoc({note:'@bank:Sicoob\\nnota'}) → 'Sicoob'", () => {
      expect(financeBankAccountFromDoc({ note: '@bank:Sicoob\nnota' })).toBe('Sicoob');
    });

    it('financeBankAccountFromDoc({}) → ""', () => {
      expect(financeBankAccountFromDoc({})).toBe('');
    });
  });

  describe('BLOCO 4 — recorrência', () => {
    it("normalizeRecurrenceType('monthly') → 'monthly'", () => {
      expect(normalizeRecurrenceType('monthly')).toBe('monthly');
    });

    it("normalizeRecurrenceType('invalido') → 'none'", () => {
      expect(normalizeRecurrenceType('invalido')).toBe('none');
    });

    it("normalizeRecurrenceDay('monthly', 15) → 15", () => {
      expect(normalizeRecurrenceDay('monthly', 15)).toBe(15);
    });

    it("normalizeRecurrenceDay('monthly', 35) → 28 (clamped)", () => {
      expect(normalizeRecurrenceDay('monthly', 35)).toBe(28);
    });

    it("normalizeRecurrenceDay('weekly', 3) → 3", () => {
      expect(normalizeRecurrenceDay('weekly', 3)).toBe(3);
    });

    it("normalizeRecurrenceDay('weekly', 9) → 6 (clamped)", () => {
      expect(normalizeRecurrenceDay('weekly', 9)).toBe(6);
    });

    it("parseRecurrenceEnd('2025-12') → '2025-12'", () => {
      expect(parseRecurrenceEnd('2025-12')).toBe('2025-12');
    });

    it("parseRecurrenceEnd('invalido') → ''", () => {
      expect(parseRecurrenceEnd('invalido')).toBe('');
    });
  });

  describe('BLOCO 5 — mapFinanceTxDoc', () => {
    it("doc com type='expense_operational', gross=100, net=-100 → mapped.direction='out', mapped.net=-100", () => {
      const mapped = mapFinanceTxDoc({
        $id: 'tx1',
        type: 'expense_operational',
        gross: 100,
        net: -100,
        status: 'settled',
      });
      expect(mapped.direction).toBe('out');
      expect(mapped.net).toBe(-100);
    });

    it("doc com type='plan', gross=200, fee=10, net=190 → mapped.net=190, mapped.direction='in'", () => {
      const mapped = mapFinanceTxDoc({
        $id: 'tx2',
        type: 'plan',
        gross: 200,
        fee: 10,
        net: 190,
        status: 'settled',
      });
      expect(mapped.net).toBe(190);
      expect(mapped.direction).toBe('in');
    });

    it('doc null → retorna null', () => {
      expect(mapFinanceTxDoc(null)).toBeNull();
    });

    it('mapped.category resolve via financeCategoryLabelFromDoc', () => {
      const doc = { type: 'plan', category: 'Mensalidades' };
      const mapped = mapFinanceTxDoc({ $id: 'tx3', ...doc, gross: 10, status: 'pending' });
      expect(mapped.category).toBe(financeCategoryLabelFromDoc(doc));
      expect(mapped.category).toBe('Mensalidades');
    });
  });

  describe('BLOCO 6 — financeTxDocumentForAppwrite', () => {
    it('payload com category e bank_account → note começa com @cat: e @bank:', () => {
      const doc = financeTxDocumentForAppwrite({
        academyId: 'a1',
        type: 'plan',
        gross: 100,
        fee: 0,
        net: 100,
        status: 'pending',
        category: 'Mensalidades',
        bank_account: 'Sicoob',
        note: 'obs',
      });
      expect(doc.note).toMatch(/^@cat:Mensalidades/);
      expect(doc.note).toContain('@bank:Sicoob');
    });

    it('payload sem category nem bank_account → note é só a userNote limpa', () => {
      const doc = financeTxDocumentForAppwrite({
        academyId: 'a1',
        type: 'plan',
        gross: 100,
        fee: 0,
        net: 100,
        status: 'pending',
        note: 'só a nota',
      });
      expect(doc.note).toBe('só a nota');
    });

    it('metadados (created_by, updated_at) NÃO aparecem no doc retornado', () => {
      const doc = financeTxDocumentForAppwrite({
        academyId: 'a1',
        type: 'plan',
        gross: 100,
        fee: 0,
        net: 100,
        status: 'pending',
        created_by: 'user1',
        updated_at: '2025-01-01T00:00:00.000Z',
      });
      expect(doc.created_by).toBeUndefined();
      expect(doc.updated_at).toBeUndefined();
    });
  });
});
