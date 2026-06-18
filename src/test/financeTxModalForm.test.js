import { describe, it, expect } from 'vitest';
import {
  competenceMonthFromDueDate,
  shouldSyncCompetenceFromDueDate,
  shouldShowFinanceTxStudentField,
  buildInitialTxForm,
  applyDirectionChangeToTxForm,
} from '../lib/financeTxModalForm.js';

describe('financeTxModalForm', () => {
  describe('competenceMonthFromDueDate', () => {
    it('extracts YYYY-MM from due date', () => {
      expect(competenceMonthFromDueDate('2026-03-15')).toBe('2026-03');
      expect(competenceMonthFromDueDate('')).toBe('');
    });
  });

  describe('shouldSyncCompetenceFromDueDate', () => {
    it('syncs for pending outflow only', () => {
      expect(
        shouldSyncCompetenceFromDueDate({ direction: 'out', receiveNow: false, editingTxId: '' })
      ).toBe(true);
      expect(
        shouldSyncCompetenceFromDueDate({ direction: 'out', receiveNow: true, editingTxId: '' })
      ).toBe(false);
      expect(
        shouldSyncCompetenceFromDueDate({ direction: 'in', receiveNow: false, editingTxId: '' })
      ).toBe(false);
      expect(
        shouldSyncCompetenceFromDueDate({ direction: 'out', receiveNow: false, editingTxId: 'tx1' })
      ).toBe(false);
    });
  });

  describe('shouldShowFinanceTxStudentField', () => {
    it('hides student for out except plan category', () => {
      expect(shouldShowFinanceTxStudentField('in', 'plan')).toBe(true);
      expect(shouldShowFinanceTxStudentField('out', 'other')).toBe(false);
      expect(shouldShowFinanceTxStudentField('out', 'plan')).toBe(true);
    });
  });

  describe('buildInitialTxForm', () => {
    it('defaults to entrada / mensalidade', () => {
      const form = buildInitialTxForm('in');
      expect(form.direction).toBe('in');
      expect(form.category).toMatch(/mensalidade/i);
    });

    it('opens outflow with outras despesas and synced competence', () => {
      const form = buildInitialTxForm('out', { bankAccount: 'Sicoob' });
      expect(form.direction).toBe('out');
      expect(form.category).toMatch(/outras despesas/i);
      expect(form.bankAccount).toBe('Sicoob');
      expect(form.competence_month).toBe(competenceMonthFromDueDate(form.due_date));
    });
  });

  describe('applyDirectionChangeToTxForm', () => {
    it('clears lead when switching to out', () => {
      const prev = buildInitialTxForm('in');
      const next = applyDirectionChangeToTxForm(
        { ...prev, lead_id: 'lead-1', planName: 'Teste' },
        'out',
        { chartAccounts: [], receiveNow: false, editingTxId: '' }
      );
      expect(next.direction).toBe('out');
      expect(next.lead_id).toBe('');
      expect(next.competence_month).toBe(competenceMonthFromDueDate(next.due_date));
    });
  });
});
