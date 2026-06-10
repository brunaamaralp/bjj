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

/** Campos obrigatórios mínimos para update_student via intake. */
export const INTAKE_REQUIRED_FIELDS = ['name', 'cpf', 'birthDate'];

/**
 * @param {object} collected
 * @returns {string[]}
 */
export function intakeMissingFields(collected) {
  const c = collected && typeof collected === 'object' ? collected : {};
  const missing = [];
  for (const f of INTAKE_REQUIRED_FIELDS) {
    if (!String(c[f] || '').trim()) missing.push(f);
  }
  return missing;
}
