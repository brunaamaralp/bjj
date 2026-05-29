import type { ContractSignerLayout } from '../../../lib/contracts/contractSignerLayout.js';
import type { ContractTemplatePurpose } from '../../features/contracts/templatesApi.js';

export type ContractTemplateEditorSnapshot = {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  bodyHtml: string;
  signerLayout: ContractSignerLayout;
};

export function buildEditorSnapshot(input: {
  name: string;
  description: string;
  purpose: ContractTemplatePurpose;
  bodyHtml: string;
  signerLayout: ContractSignerLayout;
}): ContractTemplateEditorSnapshot {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    purpose: input.purpose,
    bodyHtml: input.bodyHtml,
    signerLayout: JSON.parse(JSON.stringify(input.signerLayout)),
  };
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
  return JSON.stringify(current.signerLayout) !== JSON.stringify(baseline.signerLayout);
}
