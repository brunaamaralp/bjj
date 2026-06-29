import { describe, it, expect } from 'vitest';
import { migrateFinanceConfigToFeeReceivers } from '../lib/migrateFeeReceivers.js';

describe('migrateFeeReceivers', () => {
  it('cria recebedor padrão de acquirerFees global', () => {
    const cfg = migrateFinanceConfigToFeeReceivers({
      acquirerFees: {
        pix: { percent: 0, fixed: 0 },
        debito: { percent: 1.5, fixed: 0 },
        credito_avista: { percent: 0, fixed: 0 },
        credito_parcelado: {
          '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0,
        },
        antecipacao: { percent: 0, fixed: 0 },
      },
      bankAccounts: [],
    });
    expect(cfg.feeReceivers?.length).toBeGreaterThan(0);
    expect(cfg.defaultFeeReceiverId).toBeTruthy();
    expect(cfg.feeReceiversMigrated).toBe(true);
  });
});
