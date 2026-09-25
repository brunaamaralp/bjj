import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const downloadCsv = vi.fn();

vi.mock('../lib/reportsExport.js', () => ({
  downloadCsv: (...args) => downloadCsv(...args),
}));

import {
  inventoryBalanceFilename,
  inventoryParentsToCsvRows,
  exportInventoryBalanceCsv,
} from '../lib/inventoryBalanceExport.js';

describe('inventoryBalanceExport', () => {
  beforeEach(() => {
    downloadCsv.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('gera uma linha por variante com colunas do inventário', () => {
    const parents = [
      {
        nome: 'Kimono',
        categoria: 'Uniforme',
        variants: [
          {
            size: 'A1',
            color: 'Branco',
            current_quantity: 4,
            minimum_level: 2,
            status: 'ok',
            unit: 'unidade',
          },
          {
            size: 'A2',
            color: '',
            current_quantity: 0,
            minimum_level: 1,
            status: 'critical',
            unit: 'unidade',
          },
        ],
      },
      {
        nome: 'Faixa',
        categoria: '',
        variants: [
          {
            size: '',
            color: '',
            current_quantity: 10,
            minimum_level: 0,
            status: 'ok',
            unit: 'par',
          },
        ],
      },
    ];

    expect(inventoryParentsToCsvRows(parents)).toEqual([
      {
        produto: 'Kimono',
        variante: 'A1 / Branco',
        categoria: 'Uniforme',
        quantidade: 4,
        minimo: 2,
        status: 'OK',
        unidade: 'unidade',
      },
      {
        produto: 'Kimono',
        variante: 'A2',
        categoria: 'Uniforme',
        quantidade: 0,
        minimo: 1,
        status: 'Crítico',
        unidade: 'unidade',
      },
      {
        produto: 'Faixa',
        variante: 'Único',
        categoria: '',
        quantidade: 10,
        minimo: '',
        status: 'OK',
        unidade: 'par',
      },
    ]);
  });

  it('filename usa data local YYYY-MM-DD', () => {
    expect(inventoryBalanceFilename(new Date(2026, 8, 25, 15, 0, 0))).toBe(
      'inventario-saldo-2026-09-25.csv'
    );
  });

  it('exporta CSV vazio com mensagem quando não há linhas', () => {
    exportInventoryBalanceCsv([], { date: new Date(2026, 8, 25) });
    expect(downloadCsv).toHaveBeenCalledWith(
      [{ mensagem: 'Nenhum item no inventário com os filtros atuais' }],
      'inventario-saldo-2026-09-25-vazio.csv'
    );
  });

  it('dispara download com linhas filtradas', () => {
    exportInventoryBalanceCsv(
      [
        {
          nome: 'Kimono',
          categoria: 'Uniforme',
          variants: [
            {
              size: 'A1',
              current_quantity: 3,
              minimum_level: 1,
              status: 'ok',
              unit: 'unidade',
            },
          ],
        },
      ],
      { date: new Date(2026, 8, 25) }
    );
    expect(downloadCsv).toHaveBeenCalledWith(
      [
        {
          produto: 'Kimono',
          variante: 'A1',
          categoria: 'Uniforme',
          quantidade: 3,
          minimo: 1,
          status: 'OK',
          unidade: 'unidade',
        },
      ],
      'inventario-saldo-2026-09-25.csv'
    );
  });
});
