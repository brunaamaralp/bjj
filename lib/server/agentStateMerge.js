/**
 * Merge de agent_state multi-turno (intake cadastro, freeze_pending).
 * @param {object} current
 * @param {object|null|undefined} patch
 */
export function mergeAgentStatePatch(current, patch) {
  const base = current && typeof current === 'object' ? { ...current } : {};
  if (!patch || typeof patch !== 'object') return base;

  if (patch.clear_intake) {
    delete base.intake;
  }
  if (patch.clear_freeze_pending) {
    delete base.freeze_pending;
  }

  if (patch.intake && typeof patch.intake === 'object') {
    const prev = base.intake && typeof base.intake === 'object' ? base.intake : {};
    base.intake = {
      ...prev,
      ...patch.intake,
      collected: {
        ...(prev.collected || {}),
        ...(patch.intake.collected || {}),
      },
      missing: Array.isArray(patch.intake.missing)
        ? patch.intake.missing
        : prev.missing || [],
    };
  }

  if (patch.freeze_pending && typeof patch.freeze_pending === 'object') {
    base.freeze_pending = {
      ...(base.freeze_pending || {}),
      ...patch.freeze_pending,
    };
  }

  return base;
}

/** Campos que podem ser gravados em patch parcial de lead. */
export const PATCHABLE_LEAD_FIELDS = [
  'name',
  'age',
  'type',
  'parentName',
  'responsavel',
  'origin',
  'phone',
  'emergencyContact',
  'emergencyPhone',
  'belt',
];

/** Intake completo (matrícula). */
export const INTAKE_FULL_FIELDS = ['name', 'cpf', 'birthDate'];

/** @deprecated use INTAKE_FULL_FIELDS */
export const INTAKE_REQUIRED_FIELDS = INTAKE_FULL_FIELDS;

/**
 * @param {object} collected
 * @param {'partial'|'full'} tier
 * @returns {string[]}
 */
export function intakeMissingFieldsForTier(collected, tier = 'full') {
  const c = collected && typeof collected === 'object' ? collected : {};
  if (tier === 'partial') {
    const hasAny = PATCHABLE_LEAD_FIELDS.some((f) => String(c[f] || '').trim());
    return hasAny ? [] : ['patchable_field'];
  }
  const missing = [];
  for (const f of INTAKE_FULL_FIELDS) {
    if (!String(c[f] || '').trim()) missing.push(f);
  }
  return missing;
}

/**
 * @param {object} collected
 * @returns {string[]}
 */
export function intakeMissingFields(collected) {
  return intakeMissingFieldsForTier(collected, 'full');
}
