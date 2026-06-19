import { PLAN_CONFIG } from '../../src/lib/planConfig.js';

const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
  process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
  '';

const DEFAULT_PLAN = 'starter';

/**
 * Reverte academies.plan e ai_threads_limit para os valores padrão (starter).
 * Deve ser chamado sempre que uma assinatura for cancelada ou inativada.
 * Idempotente: chamadas repetidas escrevem o mesmo valor, sem efeito colateral.
 *
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 */
export async function resetAcademyPlanToDefault(databases, academyId) {
  if (!DB_ID || !ACADEMIES_COL || !academyId) return;
  const cfg = PLAN_CONFIG[DEFAULT_PLAN];
  try {
    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      plan: DEFAULT_PLAN,
      ai_threads_limit: cfg.threads,
      plan_updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[resetAcademyPlanToDefault] falhou:', { academyId, error: e?.message });
  }
}
