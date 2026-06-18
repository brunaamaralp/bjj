import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  buildFinanceTxPayload,
  validateManualFinanceTxIdentity,
  applyRecurrenceFields,
  omitFinanceTxMetadata,
  financeTxDocumentWithOptionals,
  resolveCompetenceMonth,
} from '../../../lib/server/financeTxFields.js';

describe('financeTxFields', () => {
  const nowIso = '2025-06-01T12:00:00.000Z';

  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
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

    it("type='expense_operational', gross=50 → { gross:50, fee:0, net:50, direction:'out' } (positivo no storage)", () => {
      expect(normalizeTxAmounts({ type: 'expense_operational', gross: 50 })).toEqual({
        gross: 50,
        fee: 0,
        net: 50,
        direction: 'out',
      });
    });

    it("type='refund', gross=30 → { gross:30, fee:0, net:30, direction:'in' } (positivo no storage)", () => {
      expect(normalizeTxAmounts({ type: 'refund', gross: 30 })).toEqual({
        gross: 30,
        fee: 0,
        net: 30,
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
    it("doc com type='expense_operational', gross=100, net=100 → mapped.direction='out', mapped.net=-100", () => {
      const mapped = mapFinanceTxDoc({
        $id: 'tx1',
        type: 'expense_operational',
        gross: 100,
        net: 100,
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

    it('maps lead_name from document', () => {
      const mapped = mapFinanceTxDoc({
        $id: 'tx-lead',
        type: 'plan',
        gross: 100,
        status: 'settled',
        lead_id: 'lead-1',
        lead_name: 'Maria Souza',
      });
      expect(mapped.lead_name).toBe('Maria Souza');
      expect(mapped.lead_id).toBe('lead-1');
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

  describe('BLOCO 7 — applyRecurrenceFields', () => {
    it('input com recurrence_origin_id → payload recebe recurrence_origin_id, não aplica template', () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        recurrence_origin_id: 'origin-abc',
        repeat_enabled: true,
        recurrence_type: 'monthly',
      });

      expect(payload).toEqual({ recurrence_origin_id: 'origin-abc' });
      expect(payload.is_recurrence_template).toBeUndefined();
    });

    it("input com repeat_enabled=true, recurrence_type='monthly', recurrence_day=10 → template mensal", () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        repeat_enabled: true,
        recurrence_type: 'monthly',
        recurrence_day: 10,
      });

      expect(payload).toEqual({
        is_recurrence_template: true,
        recurrence_type: 'monthly',
        recurrence_day: 10,
      });
    });

    it("input com repeat_enabled=true, recurrence_type='weekly', recurrence_day=3 → recurrence_day=3, recurrence_type='weekly'", () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        repeat_enabled: true,
        recurrence_type: 'weekly',
        recurrence_day: 3,
      });

      expect(payload).toEqual({
        is_recurrence_template: true,
        recurrence_type: 'weekly',
        recurrence_day: 3,
      });
    });

    it("input com repeat_enabled=true, recurrence_type='none' → NÃO define is_recurrence_template=true", () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        repeat_enabled: true,
        recurrence_type: 'none',
      });

      expect(payload.is_recurrence_template).toBeUndefined();
    });

    it('input com is_recurrence_template=false explícito → payload recebe is_recurrence_template=false, recurrence_type=none', () => {
      const payload = {};
      applyRecurrenceFields(payload, { is_recurrence_template: false });

      expect(payload).toEqual({
        is_recurrence_template: false,
        recurrence_type: 'none',
      });
    });

    it("input com recurrence_end='2025-12' válido → payload recebe recurrence_end='2025-12'", () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        repeat_enabled: true,
        recurrence_type: 'monthly',
        recurrence_day: 1,
        recurrence_end: '2025-12',
      });

      expect(payload.recurrence_end).toBe('2025-12');
    });

    it("input com recurrence_end='' → payload omite recurrence_end", () => {
      const payload = {};
      applyRecurrenceFields(payload, {
        repeat_enabled: true,
        recurrence_type: 'monthly',
        recurrence_day: 1,
        recurrence_end: '',
      });

      expect(payload.recurrence_end).toBeUndefined();
    });

    it('input sem nenhum campo de recorrência → payload não é modificado', () => {
      const payload = { academyId: 'acad-1' };
      const result = applyRecurrenceFields(payload, {});

      expect(result).toBe(payload);
      expect(payload).toEqual({ academyId: 'acad-1' });
    });
  });

  describe('BLOCO 8 — buildFinanceTxPayload', () => {
    function baseInput(overrides = {}) {
      return {
        academyId: 'acad-1',
        type: 'plan',
        gross: 200,
        fee: 10,
        method: 'pix',
        status: 'pending',
        ...overrides,
      };
    }

    it('input mínimo (pending) → payload com campos obrigatórios, sem settledAt e net=190', () => {
      const payload = buildFinanceTxPayload(baseInput());

      expect(payload.academyId).toBe('acad-1');
      expect(payload.type).toBe('plan');
      expect(payload.gross).toBe(200);
      expect(payload.fee).toBe(10);
      expect(payload.net).toBe(190);
      expect(payload.status).toBe('pending');
      expect(payload.method).toBe('pix');
      expect(payload.category).toBe('Mensalidades');
      expect(payload.planName).toBe('');
      expect(payload.origin_type).toBe('manual');
      expect(payload.created_by).toBe('system');
      expect(payload.updated_by).toBe('system');
      expect(payload.updated_at).toBe(nowIso);
      expect(payload.settledAt).toBeUndefined();
    });

    it("status='settled' sem settledAt explícito → settledAt=nowIso e competence_month='2025-06'", () => {
      const payload = buildFinanceTxPayload(baseInput({ status: 'settled' }));

      expect(payload.settledAt).toBe(nowIso);
      expect(payload.competence_month).toBe('2025-06');
      expect(resolveCompetenceMonth({}, payload.settledAt)).toBe('2025-06');
    });

    it("status='pending' com due_date → competence_month do vencimento", () => {
      const payload = buildFinanceTxPayload(
        baseInput({
          status: 'pending',
          due_date: '2026-08-15',
        })
      );

      expect(payload.settledAt).toBeUndefined();
      expect(payload.due_date).toBe('2026-08-15');
      expect(payload.competence_month).toBe('2026-08');
    });

    it("status='settled' com settledAt='2025-03-15T00:00:00Z' → settledAt e competence_month='2025-03'", () => {
      const payload = buildFinanceTxPayload(
        baseInput({
          status: 'settled',
          settledAt: '2025-03-15T00:00:00Z',
        })
      );

      expect(payload.settledAt).toBe('2025-03-15T00:00:00Z');
      expect(payload.competence_month).toBe('2025-03');
    });

    it("type='expense_operational', gross=50 → net=50 no payload (negativo só no map)", () => {
      const payload = buildFinanceTxPayload(
        baseInput({
          type: 'expense_operational',
          gross: 50,
          fee: 0,
        })
      );

      expect(payload.net).toBe(50);
      expect(normalizeTxAmounts({ type: 'expense_operational', gross: 50 }).net).toBe(50);
      expect(mapFinanceTxDoc({ type: 'expense_operational', gross: 50, net: 50 }).net).toBe(-50);
    });

    it('gross inválido (0) → lança erro (normalizeTxAmounts propaga)', () => {
      expect(() => buildFinanceTxPayload(baseInput({ gross: 0 }))).toThrow('valor_invalido');
    });

    it('installments clamped: installments=20 → 12; installments=0 → 1', () => {
      expect(buildFinanceTxPayload(baseInput({ installments: 20 })).installments).toBe(12);
      expect(buildFinanceTxPayload(baseInput({ installments: 0 })).installments).toBe(1);
    });

    it('bank_account fornecido → aparece em payload.bank_account', () => {
      const payload = buildFinanceTxPayload(baseInput({ bank_account: 'Sicoob' }));

      expect(payload.bank_account).toBe('Sicoob');
    });

    it('note longa (>2000 chars) → truncada em 2000', () => {
      const payload = buildFinanceTxPayload(baseInput({ note: 'x'.repeat(2500) }));

      expect(payload.note).toHaveLength(2000);
    });

    it("meta.origin_type='webhook' → payload.origin_type='webhook'", () => {
      const payload = buildFinanceTxPayload(baseInput(), { origin_type: 'webhook' });

      expect(payload.origin_type).toBe('webhook');
    });

    it("meta.created_by='user-x' → payload.created_by='user-x'", () => {
      const payload = buildFinanceTxPayload(baseInput(), { created_by: 'user-x' });

      expect(payload.created_by).toBe('user-x');
    });
  });

  describe('validateManualFinanceTxIdentity', () => {
    it('exige descrição em saída manual', () => {
      expect(
        validateManualFinanceTxIdentity({
          direction: 'out',
          type: 'expense_operational',
          category: 'Salários e encargos',
          planName: '',
        })
      ).toMatch(/descrição/i);
    });

    it('aceita saída manual com planName', () => {
      expect(
        validateManualFinanceTxIdentity({
          direction: 'out',
          type: 'expense_operational',
          planName: 'Salário Hugo',
        })
      ).toBeNull();
    });

    it('ignora lançamentos automáticos de venda', () => {
      expect(
        validateManualFinanceTxIdentity(
          { direction: 'out', type: 'expense_operational', planName: '' },
          { origin_type: 'sale_cmv' }
        )
      ).toBeNull();
    });
  });

  describe('BLOCO 9 — omitFinanceTxMetadata / financeTxDocumentWithOptionals', () => {
    it('omitFinanceTxMetadata remove metadados e mantém outros campos intactos', () => {
      const result = omitFinanceTxMetadata({
        academyId: 'acad-1',
        type: 'plan',
        created_by: 'u1',
        createdBy: 'u2',
        updated_by: 'u3',
        updatedBy: 'u4',
        updated_at: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z',
        gross: 100,
      });

      expect(result).toEqual({
        academyId: 'acad-1',
        type: 'plan',
        gross: 100,
      });
    });

    it('financeTxDocumentWithOptionals inclui opcionais e NÃO inclui metadados', () => {
      const doc = financeTxDocumentWithOptionals({
        academyId: 'acad-1',
        type: 'plan',
        gross: 100,
        fee: 0,
        net: 100,
        status: 'pending',
        method: 'pix',
        recurrence_type: 'monthly',
        lead_id: 'lead-1',
        competence_month: '2025-06',
        created_by: 'user-1',
        updated_at: '2025-06-01T12:00:00.000Z',
      });

      expect(doc.recurrence_type).toBe('monthly');
      expect(doc.lead_id).toBe('lead-1');
      expect(doc.competence_month).toBe('2025-06');
      expect(doc.settledAt).toBeUndefined();
      expect(doc.created_by).toBeUndefined();
      expect(doc.updated_at).toBeUndefined();
      expect(doc.updated_by).toBeUndefined();
    });

    it('financeTxDocumentWithOptionals grava saída com net positivo (direction out)', () => {
      const doc = financeTxDocumentWithOptionals({
        academyId: 'acad-1',
        type: 'expense_operational',
        direction: 'out',
        gross: 80,
        fee: 0,
        net: 80,
        status: 'pending',
        method: 'pix',
        planName: 'Aluguel',
        due_date: '2026-06-20',
      });

      expect(doc.direction).toBe('out');
      expect(doc.gross).toBe(80);
      expect(doc.net).toBe(80);
      expect(doc.type).toBe('exp_operational');
      expect(doc.due_date).toBe('2026-06-20');
    });

    it('encodeFinanceTxTypeForStorage e decodeFinanceTxTypeFromStorage são inversos', async () => {
      const { encodeFinanceTxTypeForStorage, decodeFinanceTxTypeFromStorage } = await import(
        '../../../lib/server/financeTxFields.js'
      );
      expect(encodeFinanceTxTypeForStorage('expense_operational')).toBe('exp_operational');
      expect(decodeFinanceTxTypeFromStorage('exp_operational')).toBe('expense_operational');
      expect(encodeFinanceTxTypeForStorage('plan')).toBe('plan');
      expect(
        mapFinanceTxDoc({ type: 'bal_sheet_out', gross: 10, net: 10, direction: 'out' }).type
      ).toBe('balance_sheet_out');
    });
  });
});
