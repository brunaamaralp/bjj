/**
 * Persistência de logs de audiência (coleção automation_logs no Appwrite).
 */

/** @type {Array<Record<string, unknown>>} */
const pendingLogs = [];

let persistFn = null;

function loadServerPersist() {
  if (persistFn) return persistFn;
  if (typeof window !== 'undefined') return null;
  persistFn = async (entry) => {
    try {
      const mod = await import('../../lib/server/persistAutomationAudienceLog.js');
      await mod.persistAutomationAudienceLog(entry);
    } catch (e) {
      console.warn('[automationAudienceLog] persist failed', e?.message || e);
    }
  };
  return persistFn;
}

/**
 * @param {Record<string, unknown>} entry
 */
export function logAudienceResult(entry) {
  pendingLogs.push(entry);
  const persist = loadServerPersist();
  if (persist) void persist(entry);
}

/** Apenas para testes — limpa buffer in-memory. */
export function __clearAudienceLogsForTests() {
  pendingLogs.length = 0;
}

/** Apenas para testes — última entrada gravada. */
export function __getLastAudienceLogForTests() {
  return pendingLogs[pendingLogs.length - 1] ?? null;
}
