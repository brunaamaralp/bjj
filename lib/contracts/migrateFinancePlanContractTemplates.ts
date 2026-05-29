import type { ContractTemplateRecord } from './contractTemplateService.js';
import { parseContractTemplatePurpose } from './contractTemplatePurpose.js';

type FinanceConfigLike = {
  plans?: Array<{
    name?: string;
    contractTemplateId?: string;
    rescissionTemplateId?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

/** Migra plan_names dos modelos para contractTemplateId nos planos (não sobrescreve vínculos existentes). */
export function migrateFinanceConfigPlanTemplates(
  financeConfig: FinanceConfigLike,
  templates: ContractTemplateRecord[]
): { config: FinanceConfigLike; changed: boolean } {
  const plans = [...(financeConfig.plans || [])];
  let changed = false;

  for (const plan of plans) {
    const planName = String(plan.name || '').trim();
    if (!planName || plan.contractTemplateId) continue;

    const match = templates.find(
      (t) =>
        t.active &&
        parseContractTemplatePurpose(t.purpose) === 'enrollment' &&
        t.planNames.some((n) => String(n).trim().toLowerCase() === planName.toLowerCase())
    );
    if (match) {
      plan.contractTemplateId = match.$id;
      changed = true;
    }
  }

  if (!changed) return { config: financeConfig, changed: false };
  return { config: { ...financeConfig, plans }, changed: true };
}
