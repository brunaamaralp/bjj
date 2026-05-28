import { describe, it, expect } from 'vitest';
import {
  adjustmentReferenciaId,
  adjustmentReferenciaSign,
  isAdjustmentSubtype,
  isInventoryAdjustConfirmText,
  buildAdjustmentMotivo,
  formatAdjustToast,
  quantityChangeFromAdjustment,
  previewBalanceAfterAdjustment,
  subtypeSuggestsRemoval,
} from '../lib/inventoryAdjust.js';

describe('inventoryAdjust', () => {
  it('validates subtypes', () => {
    expect(isAdjustmentSubtype('avaria')).toBe(true);
    expect(isAdjustmentSubtype('furto')).toBe(true);
    expect(isAdjustmentSubtype('x')).toBe(false);
  });

  it('detects confirm text', () => {
    expect(isInventoryAdjustConfirmText('sim')).toBe(true);
    expect(isInventoryAdjustConfirmText('confirma')).toBe(true);
    expect(isInventoryAdjustConfirmText('não')).toBe(false);
  });

  it('adjustmentReferenciaId encodes sign', () => {
    expect(adjustmentReferenciaId(-2)).toBe('adjustment:out');
    expect(adjustmentReferenciaId(3)).toBe('adjustment:in');
    expect(adjustmentReferenciaSign('adjustment:out')).toBe(-1);
    expect(adjustmentReferenciaSign('adjustment:in')).toBe(1);
  });

  it('buildAdjustmentMotivo', () => {
    expect(buildAdjustmentMotivo('avaria', 'quebrou na queda')).toContain('Avaria');
    expect(buildAdjustmentMotivo('furto', '')).toBe('Furto');
  });

  it('formatAdjustToast', () => {
    expect(formatAdjustToast(3, 2)).toBe('Saldo ajustado de 3 para 2 unidades');
  });

  it('quantityChangeFromAdjustment', () => {
    expect(quantityChangeFromAdjustment({ direction: 'remove', quantity: 2, currentQuantity: 5 })).toBe(-2);
    expect(quantityChangeFromAdjustment({ direction: 'add', quantity: 1, currentQuantity: 5 })).toBe(1);
    expect(quantityChangeFromAdjustment({ targetQuantity: 4, currentQuantity: 7 })).toBe(-3);
    expect(quantityChangeFromAdjustment({ targetQuantity: 7, currentQuantity: 7 })).toBe(0);
    expect(subtypeSuggestsRemoval('avaria')).toBe(true);
    expect(subtypeSuggestsRemoval('erro_conta')).toBe(false);
  });

  it('previewBalanceAfterAdjustment', () => {
    expect(
      previewBalanceAfterAdjustment({ direction: 'remove', quantity: 1, currentQuantity: 3 })
    ).toEqual({ before: 3, after: 2, change: -1 });
  });
});
