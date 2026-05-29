/** Vínculo plano ↔ modelo de contrato (fonte: financeConfig.plans). */

export const CONTRACT_TEMPLATE_PURPOSE_LABELS = {
  enrollment: 'Matrícula',
  rescission: 'Rescisão',
};

export function normalizeTemplatePurpose(raw) {
  const s = String(raw || 'enrollment').trim().toLowerCase();
  return s === 'rescission' ? 'rescission' : 'enrollment';
}

export function templatesForPurpose(templates, purpose) {
  const p = normalizeTemplatePurpose(purpose);
  return (templates || []).filter(
    (t) => t.active !== false && normalizeTemplatePurpose(t.purpose) === p
  );
}

export function plansUsingTemplate(financeConfig, templateId, field = 'contractTemplateId') {
  const id = String(templateId || '').trim();
  if (!id) return [];
  return (financeConfig?.plans || [])
    .filter((pl) => String(pl?.[field] || '').trim() === id)
    .map((pl) => String(pl.name || '').trim())
    .filter(Boolean);
}

/** Planos nomeados sem vínculo obrigatório quando existem modelos ativos do tipo. */
export function validateFinancePlansContractTemplates(financeConfig, templates) {
  const plans = (financeConfig?.plans || [])
    .map((p) => ({ ...p, name: String(p?.name || '').trim() }))
    .filter((p) => p.name);

  const enrollmentTemplates = templatesForPurpose(templates, 'enrollment');
  const rescissionTemplates = templatesForPurpose(templates, 'rescission');
  const missing = [];

  for (const pl of plans) {
    if (enrollmentTemplates.length > 0) {
      const tid = String(pl.contractTemplateId || '').trim();
      if (!tid || !enrollmentTemplates.some((t) => t.$id === tid)) {
        missing.push({ planName: pl.name, kind: 'enrollment' });
      }
    }
    if (rescissionTemplates.length > 0) {
      const tid = String(pl.rescissionTemplateId || '').trim();
      if (!tid || !rescissionTemplates.some((t) => t.$id === tid)) {
        missing.push({ planName: pl.name, kind: 'rescission' });
      }
    }
  }

  return { ok: missing.length === 0, missing };
}

export function defaultTemplateForPurpose(templates, purpose) {
  const p = normalizeTemplatePurpose(purpose);
  return (
    templatesForPurpose(templates, p).find((t) => t.isDefault) ||
    templatesForPurpose(templates, p)[0] ||
    null
  );
}

/** Migra plan_names legados nos modelos para contractTemplateId (não sobrescreve vínculos). */
export function migrateFinanceConfigFromLegacyPlanNames(financeConfig, templates) {
  const plans = [...(financeConfig?.plans || [])];
  let changed = false;
  for (const plan of plans) {
    const planName = String(plan.name || '').trim();
    if (!planName || plan.contractTemplateId) continue;
    const match = (templates || []).find(
      (t) =>
        t.active !== false &&
        normalizeTemplatePurpose(t.purpose) === 'enrollment' &&
        (t.planNames || []).some((n) => String(n).trim().toLowerCase() === planName.toLowerCase())
    );
    if (match) {
      plan.contractTemplateId = match.$id;
      changed = true;
    }
  }
  if (!changed) return { config: financeConfig, changed: false };
  return { config: { ...financeConfig, plans }, changed: true };
}

/** Preenche contractTemplateId e rescissionTemplateId vazios com os modelos padrão de cada tipo. */
export function applyDefaultPlanContractLinks(financeConfig, templates) {
  const defEnroll = defaultTemplateForPurpose(templates, 'enrollment');
  const defRescind = defaultTemplateForPurpose(templates, 'rescission');
  const plans = [...(financeConfig?.plans || [])];
  let changed = false;
  let plansLinked = 0;

  for (const plan of plans) {
    const name = String(plan.name || '').trim();
    if (!name) continue;
    let touched = false;
    if (defEnroll && !String(plan.contractTemplateId || '').trim()) {
      plan.contractTemplateId = defEnroll.$id;
      touched = true;
      changed = true;
    }
    if (defRescind && !String(plan.rescissionTemplateId || '').trim()) {
      plan.rescissionTemplateId = defRescind.$id;
      touched = true;
      changed = true;
    }
    if (touched) plansLinked += 1;
  }

  if (!changed) return { config: financeConfig, changed: false, plansLinked: 0 };
  return { config: { ...financeConfig, plans }, changed: true, plansLinked };
}
