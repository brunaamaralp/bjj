import { describe, expect, it } from 'vitest';
import {
  hasBlockingStockMovesFromDocuments,
  isSetupOnlyStockMove,
} from '../../lib/server/productDeletePolicy.js';

describe('productDeletePolicy', () => {
  it('entrada cadastro_inicial não bloqueia exclusão', () => {
    expect(isSetupOnlyStockMove({ tipo: 'entrada', motivo: 'cadastro_inicial' })).toBe(true);
    expect(
      hasBlockingStockMovesFromDocuments([{ tipo: 'entrada', motivo: 'cadastro_inicial' }])
    ).toBe(false);
  });

  it('ajuste e saída bloqueiam exclusão', () => {
    expect(hasBlockingStockMovesFromDocuments([{ tipo: 'ajuste', motivo: 'Avaria' }])).toBe(true);
    expect(hasBlockingStockMovesFromDocuments([{ tipo: 'saida_venda', motivo: 'venda' }])).toBe(
      true
    );
  });

  it('cadastro_inicial seguido de ajuste bloqueia', () => {
    expect(
      hasBlockingStockMovesFromDocuments([
        { tipo: 'entrada', motivo: 'cadastro_inicial' },
        { tipo: 'ajuste', motivo: 'Avaria' },
      ])
    ).toBe(true);
  });
});
