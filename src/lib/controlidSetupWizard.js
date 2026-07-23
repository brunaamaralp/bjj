/** Passos do setup da catraca Control iD (1º uso vs edição). */

export const CONTROLID_SETUP_STEP_CONNECT = 1;
export const CONTROLID_SETUP_STEP_PORTAL = 2;
export const CONTROLID_SETUP_STEP_RULES = 3;

/**
 * @param {number} current
 * @param {{ tested?: boolean }} [opts]
 */
export function nextControlIdSetupStep(current, { tested = false } = {}) {
  const step = Number(current) || CONTROLID_SETUP_STEP_CONNECT;
  if (step === CONTROLID_SETUP_STEP_CONNECT && tested) {
    return CONTROLID_SETUP_STEP_PORTAL;
  }
  if (step === CONTROLID_SETUP_STEP_PORTAL) {
    return CONTROLID_SETUP_STEP_RULES;
  }
  return step;
}

/**
 * @param {number} step
 * @param {{ editMode?: boolean }} [opts]
 */
export function visibleControlIdSetupSections(step, { editMode = false } = {}) {
  if (editMode) {
    return { connect: true, portal: true, rules: true, status: true };
  }
  const s = Number(step) || CONTROLID_SETUP_STEP_CONNECT;
  return {
    connect: true,
    portal: s >= CONTROLID_SETUP_STEP_PORTAL,
    rules: s >= CONTROLID_SETUP_STEP_RULES,
    status: s >= CONTROLID_SETUP_STEP_RULES,
  };
}
