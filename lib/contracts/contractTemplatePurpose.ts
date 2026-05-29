export type ContractTemplatePurpose = 'enrollment' | 'rescission';

export const CONTRACT_TEMPLATE_PURPOSE_LABELS: Record<ContractTemplatePurpose, string> = {
  enrollment: 'Matrícula',
  rescission: 'Rescisão',
};

export function parseContractTemplatePurpose(raw: unknown): ContractTemplatePurpose {
  const s = String(raw || 'enrollment').trim().toLowerCase();
  return s === 'rescission' ? 'rescission' : 'enrollment';
}

export type FinancePlanContractLink = {
  name?: string;
  contractTemplateId?: string;
  rescissionTemplateId?: string;
};

export function financePlanTemplateField(
  purpose: ContractTemplatePurpose
): 'contractTemplateId' | 'rescissionTemplateId' {
  return purpose === 'rescission' ? 'rescissionTemplateId' : 'contractTemplateId';
}
