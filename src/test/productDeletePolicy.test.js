import { describe, expect, it } from 'vitest';
import {
  hasBlockingStockMovesFromDocuments,
  isSaleBlockingStatus,
  isSaleRelatedStockMove,
  isSetupOnlyStockMove,
} from '../../lib/server/productDeletePolicy.js';

describe('productDeletePolicy', () => {
  it('entrada cadastro_inicial não bloqueia exclusão', () => {
    expect(isSetupOnlyStockMove({ tipo: 'entrada', motivo: 'cadastro_inicial' })).toBe(true);
    expect(
      hasBlockingStockMovesFromDocuments([{ tipo: 'entrada', motivo: 'cadastro_inicial' }])
    ).toBe(false);
  });

  it('ajuste para zerar saldo não bloqueia exclusão', () => {
    expect(
      hasBlockingStockMovesFromDocuments([{ tipo: 'ajuste', motivo: 'Erro de contagem' }])
    ).toBe(false);
    expect(
      hasBlockingStockMovesFromDocuments([
        { tipo: 'entrada', motivo: 'cadastro_inicial' },
        { tipo: 'ajuste', motivo: 'Doação/descarte' },
      ])
    ).toBe(false);
  });

  it('saida_venda e saida_aluguel bloqueiam', () => {
    expect(isSaleRelatedStockMove({ tipo: 'saida_venda', motivo: 'venda' })).toBe(true);
    expect(hasBlockingStockMovesFromDocuments([{ tipo: 'saida_venda', motivo: 'venda' }])).toBe(
      true
    );
    expect(hasBlockingStockMovesFromDocuments([{ tipo: 'saida_aluguel', motivo: 'aluguel' }])).toBe(
      true
    );
  });

  it('isSaleBlockingStatus ignora cancelada e rascunho', () => {
    expect(isSaleBlockingStatus('concluida')).toBe(true);
    expect(isSaleBlockingStatus('cancelada')).toBe(false);
    expect(isSaleBlockingStatus('rascunho')).toBe(false);
  });
});
