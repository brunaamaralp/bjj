import { describe, it, expect } from 'vitest';
import {
  adjustmentReferenciaId,
  adjustmentReferenciaSign,
  isAdjustmentSubtype,
  isInventoryAdjustConfirmText,
  buildAdjustmentMotivo,
  formatAdjustToast,
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
});
