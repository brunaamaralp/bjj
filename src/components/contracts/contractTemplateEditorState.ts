export type ContractTemplateEditorSnapshot = {
  name: string;
  description: string;
  planNames: string[];
  isDefault: boolean;
  bodyHtml: string;
};

export function buildEditorSnapshot(input: {
  name: string;
  description: string;
  planNames: string[];
  isDefault: boolean;
  bodyHtml: string;
}): ContractTemplateEditorSnapshot {
  return {
    name: input.name.trim(),
    description: input.description.trim(),
    planNames: [...input.planNames].map((p) => p.trim()).filter(Boolean).sort(),
    isDefault: input.isDefault,
    bodyHtml: input.bodyHtml,
  };
}

export function isEditorDirty(
  current: ContractTemplateEditorSnapshot,
  baseline: ContractTemplateEditorSnapshot | null
): boolean {
  if (!baseline) return false;
  if (current.name !== baseline.name) return true;
  if (current.description !== baseline.description) return true;
  if (current.isDefault !== baseline.isDefault) return true;
  if (current.bodyHtml !== baseline.bodyHtml) return true;
  if (current.planNames.length !== baseline.planNames.length) return true;
  return current.planNames.some((p, i) => p !== baseline.planNames[i]);
}
