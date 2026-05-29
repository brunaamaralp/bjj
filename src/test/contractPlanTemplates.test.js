import { describe, expect, it } from 'vitest';
import {
  migrateFinanceConfigFromLegacyPlanNames,
  validateFinancePlansContractTemplates,
} from '../lib/contractPlanTemplates.js';

describe('contractPlanTemplates', () => {
  it('migrates legacy plan_names to contractTemplateId', () => {
    const financeConfig = { plans: [{ name: 'Mensal', price: 100 }] };
    const templates = [
      {
        $id: 't1',
        active: true,
        purpose: 'enrollment',
        planNames: ['Mensal'],
      },
    ];
    const { config, changed } = migrateFinanceConfigFromLegacyPlanNames(financeConfig, templates);
    expect(changed).toBe(true);
    expect(config.plans[0].contractTemplateId).toBe('t1');
  });

  it('validates missing plan template links', () => {
    const financeConfig = { plans: [{ name: 'Diária', price: 50 }] };
    const templates = [
      { $id: 'e1', active: true, purpose: 'enrollment', isDefault: true },
      { $id: 'r1', active: true, purpose: 'rescission', isDefault: true },
    ];
    const { ok, missing } = validateFinancePlansContractTemplates(financeConfig, templates);
    expect(ok).toBe(false);
    expect(missing).toHaveLength(2);
  });
});
