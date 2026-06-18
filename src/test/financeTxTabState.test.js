import { describe, it, expect, beforeEach } from 'vitest';
import {
  OPTIONAL_TX_COLUMNS,
  defaultTxColumnVisibility,
  loadTxColumnVisibility,
  saveTxColumnVisibility,
  parseStatusFilterParam,
  parseDirectionFilterParam,
  patchFinanceTxUrlParam,
  getTxModalTitle,
  getTxModalSaveLabel,
  getTxModalIntro,
  TX_COLUMNS_STORAGE_PREFIX,
} from '../lib/financeTxTabState.js';

describe('financeTxTabState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('parseStatusFilterParam', () => {
    it('accepts valid statuses', () => {
      expect(parseStatusFilterParam('pending')).toBe('pending');
      expect(parseStatusFilterParam('SETTLED')).toBe('settled');
      expect(parseStatusFilterParam('cancelled')).toBe('cancelled');
    });

    it('falls back to all for invalid values', () => {
      expect(parseStatusFilterParam('')).toBe('all');
      expect(parseStatusFilterParam('foo')).toBe('all');
    });
  });

  describe('parseDirectionFilterParam', () => {
    it('accepts in/out', () => {
      expect(parseDirectionFilterParam('in')).toBe('in');
      expect(parseDirectionFilterParam('OUT')).toBe('out');
    });

    it('falls back to all', () => {
      expect(parseDirectionFilterParam('')).toBe('all');
      expect(parseDirectionFilterParam('both')).toBe('all');
    });
  });

  describe('patchFinanceTxUrlParam', () => {
    it('sets and removes status', () => {
      const base = new URLSearchParams('tab=movimentacoes');
      expect(patchFinanceTxUrlParam(base, 'status', 'pending').get('status')).toBe('pending');
      expect(patchFinanceTxUrlParam(base, 'status', 'all').get('status')).toBeNull();
      expect(patchFinanceTxUrlParam(base, 'status', '').get('status')).toBeNull();
    });

    it('preserves unrelated params', () => {
      const base = new URLSearchParams('tab=movimentacoes&conta=Sicoob');
      const next = patchFinanceTxUrlParam(base, 'q', 'maria');
      expect(next.get('tab')).toBe('movimentacoes');
      expect(next.get('conta')).toBe('Sicoob');
      expect(next.get('q')).toBe('maria');
    });
  });

  describe('column visibility persistence', () => {
    it('defaults optional columns hidden', () => {
      const vis = defaultTxColumnVisibility();
      for (const col of OPTIONAL_TX_COLUMNS) {
        expect(vis[col.key]).toBe(false);
      }
    });

    it('round-trips via localStorage per academy', () => {
      saveTxColumnVisibility('acad-1', { ...defaultTxColumnVisibility(), type: true, fee: true });
      const loaded = loadTxColumnVisibility('acad-1');
      expect(loaded.type).toBe(true);
      expect(loaded.fee).toBe(true);
      expect(loaded.bank).toBe(false);
      expect(localStorage.getItem(`${TX_COLUMNS_STORAGE_PREFIX}:acad-1`)).toBeTruthy();
    });

    it('ignores invalid stored JSON', () => {
      localStorage.setItem(`${TX_COLUMNS_STORAGE_PREFIX}:acad-2`, 'not-json');
      expect(loadTxColumnVisibility('acad-2')).toEqual(defaultTxColumnVisibility());
    });
  });

  describe('modal copy helpers', () => {
    it('getTxModalTitle', () => {
      expect(getTxModalTitle({ editingRecurrenceOnly: true, editingTxId: '' })).toBe(
        'Editar recorrência'
      );
      expect(getTxModalTitle({ editingRecurrenceOnly: false, editingTxId: 'tx1' })).toBe(
        'Editar lançamento'
      );
      expect(getTxModalTitle({ editingRecurrenceOnly: false, editingTxId: '' })).toBe(
        'Novo lançamento'
      );
      expect(
        getTxModalTitle({ editingRecurrenceOnly: false, editingTxId: '', direction: 'out' })
      ).toBe('Nova saída');
    });

    it('getTxModalSaveLabel', () => {
      expect(getTxModalSaveLabel({ savingTx: true })).toBe('Salvando…');
      expect(
        getTxModalSaveLabel({ savingTx: false, editingRecurrenceOnly: true, receiveNow: false })
      ).toBe('Salvar recorrência');
      expect(
        getTxModalSaveLabel({
          savingTx: false,
          editingRecurrenceOnly: false,
          editingTxId: 'x',
          receiveNow: false,
        })
      ).toBe('Salvar alterações');
      expect(
        getTxModalSaveLabel({
          savingTx: false,
          editingRecurrenceOnly: false,
          editingTxId: '',
          receiveNow: true,
        })
      ).toBe('Registrar e liquidar');
      expect(
        getTxModalSaveLabel({
          savingTx: false,
          editingRecurrenceOnly: false,
          editingTxId: '',
          receiveNow: false,
        })
      ).toBe('Registrar lançamento');
    });

    it('getTxModalIntro', () => {
      expect(getTxModalIntro('in')).toContain('entrada');
      expect(getTxModalIntro('in')).toContain('Recebido agora');
      expect(getTxModalIntro('out')).toContain('saída');
      expect(getTxModalIntro('out')).toContain('Pago agora');
    });
  });
});
