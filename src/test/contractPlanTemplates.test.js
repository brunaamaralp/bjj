import { describe, expect, it } from 'vitest';
import {
  applyDefaultPlanContractLinks,
  applyTemplatePlanLinks,
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

  it('applies default template ids to plans without links', () => {
    const financeConfig = { plans: [{ name: 'Mensal', price: 100 }] };
    const templates = [
      { $id: 'e1', active: true, purpose: 'enrollment', isDefault: true },
      { $id: 'r1', active: true, purpose: 'rescission', isDefault: true },
    ];
    const { config, changed, plansLinked } = applyDefaultPlanContractLinks(financeConfig, templates);
    expect(changed).toBe(true);
    expect(plansLinked).toBe(1);
    expect(config.plans[0].contractTemplateId).toBe('e1');
    expect(config.plans[0].rescissionTemplateId).toBe('r1');
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

  it('repairs stale template ids when applying defaults', () => {
    const financeConfig = {
      plans: [{ name: 'Mensal', contractTemplateId: 'deleted', rescissionTemplateId: 'gone' }],
    };
    const templates = [
      { $id: 'e1', active: true, purpose: 'enrollment', isDefault: true },
      { $id: 'r1', active: true, purpose: 'rescission', isDefault: true },
    ];
    const { config, changed } = applyDefaultPlanContractLinks(financeConfig, templates);
    expect(changed).toBe(true);
    expect(config.plans[0].contractTemplateId).toBe('e1');
    expect(config.plans[0].rescissionTemplateId).toBe('r1');
    const { ok } = validateFinancePlansContractTemplates(config, templates);
    expect(ok).toBe(true);
  });

  it('links and unlinks plans from template editor selection', () => {
    const financeConfig = {
      plans: [
        { name: 'Mensal', contractTemplateId: 'old' },
        { name: 'Anual', contractTemplateId: 'old' },
      ],
    };
    const templates = [
      { $id: 'old', active: true, purpose: 'enrollment', isDefault: true },
      { $id: 'new', active: true, purpose: 'enrollment', isDefault: false },
    ];

    const linked = applyTemplatePlanLinks(financeConfig, {
      templateId: 'new',
      purpose: 'enrollment',
      selectedPlanNames: ['Mensal'],
      templates,
    });
    expect(linked.changed).toBe(true);
    expect(linked.config.plans[0].contractTemplateId).toBe('new');
    expect(linked.config.plans[1].contractTemplateId).toBe('old');

    const unlinked = applyTemplatePlanLinks(linked.config, {
      templateId: 'new',
      purpose: 'enrollment',
      selectedPlanNames: [],
      templates,
    });
    expect(unlinked.changed).toBe(true);
    expect(unlinked.config.plans[0].contractTemplateId).toBe('old');
  });
});
