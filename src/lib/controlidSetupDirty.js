/**
 * Snapshot / dirty check do formulário de config Control iD.
 * @typedef {{
 *   enabled: boolean,
 *   ip: string,
 *   port: string,
 *   username: string,
 *   password: string,
 *   portalId: string,
 *   relayUrl: string,
 *   entryCooldownMinutes: string,
 *   blockOverdueAccess: boolean,
 * }} ControlIdConfigFormState
 */

/** @param {ControlIdConfigFormState} form */
export function snapshotControlIdConfigForm(form) {
  return {
    enabled: Boolean(form?.enabled),
    ip: String(form?.ip || '').trim(),
    port: String(form?.port || '').trim(),
    username: String(form?.username || '').trim(),
    password: String(form?.password || ''),
    portalId: String(form?.portalId || '').trim(),
    relayUrl: String(form?.relayUrl || '').trim(),
    entryCooldownMinutes: String(form?.entryCooldownMinutes || '').trim(),
    blockOverdueAccess: Boolean(form?.blockOverdueAccess),
  };
}

/**
 * @param {ControlIdConfigFormState} form
 * @param {ReturnType<typeof snapshotControlIdConfigForm>|null|undefined} baseline
 */
export function isControlIdConfigDirty(form, baseline) {
  if (!baseline) return false;
  const cur = snapshotControlIdConfigForm(form);
  return (
    cur.enabled !== baseline.enabled ||
    cur.ip !== baseline.ip ||
    cur.port !== baseline.port ||
    cur.username !== baseline.username ||
    cur.password !== baseline.password ||
    cur.portalId !== baseline.portalId ||
    cur.relayUrl !== baseline.relayUrl ||
    cur.entryCooldownMinutes !== baseline.entryCooldownMinutes ||
    cur.blockOverdueAccess !== baseline.blockOverdueAccess
  );
}
