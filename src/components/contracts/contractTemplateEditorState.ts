import type { ContractSignerLayout } from '../../../lib/contracts/contractSignerLayout.js';
import type { ContractTemplatePurpose } from '../../features/contracts/templatesApi.js';

export type ContractTemplateEditorSnapshot = {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  bodyHtml: string;
  signerLayout: ContractSignerLayout;
  selectedPlanNames: string[];
};

export function buildEditorSnapshot(input: {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  bodyHtml: string;
  signerLayout: ContractSignerLayout;
  selectedPlanNames?: string[];
}): ContractTemplateEditorSnapshot {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    purpose: input.purpose,
    bodyHtml: input.bodyHtml,
    signerLayout: JSON.parse(JSON.stringify(input.signerLayout)),
    selectedPlanNames: [...(input.selectedPlanNames || [])].map((n) => String(n).trim()).filter(Boolean),
  };
}

function planNamesEqual(a: string[], b: string[]): boolean {
  const norm = (arr: string[]) =>
    [...arr].map((n) => n.trim().toLowerCase()).filter(Boolean).sort().join('\0');
  return norm(a) === norm(b);
}

export function isEditorDirty(
  current: ContractTemplateEditorSnapshot,
  baseline: ContractTemplateEditorSnapshot | null
): boolean {
  if (!baseline) return false;
  if (current.name !== baseline.name) return true;
  if (current.description !== baseline.description) return true;
  if (current.purpose !== baseline.purpose) return true;
  if (current.bodyHtml !== baseline.bodyHtml) return true;
  if (!planNamesEqual(current.selectedPlanNames, baseline.selectedPlanNames)) return true;
  return JSON.stringify(current.signerLayout) !== JSON.stringify(baseline.signerLayout);
}
