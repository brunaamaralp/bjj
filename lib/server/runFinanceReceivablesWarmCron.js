/**
 * Cron: pré-aquece snapshot de contas a receber (cache servidor) para academias com finance ativo.
 */
import { Query } from 'node-appwrite';
import { Client, Databases } from 'node-appwrite';
import { academyHasFinanceModule } from '../../src/lib/collectionRules.js';
import { mergeFinanceConfigFromAcademyDoc } from '../../src/lib/financeConfigStorage.js';
import { loadReceivablesSnapshotBundle } from './financeReceivablesSnapshot.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || '';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const MAX_WARM_PER_RUN = Math.max(
  1,
  Number(process.env.FINANCE_RECEIVABLES_WARM_MAX || 25) || 25
);

function currentMonthYm() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function runFinanceReceivablesWarmCron() {
  if (!ACADEMIES_COL || !DB_ID || !API_KEY || !PROJECT_ID) {
    return { ok: false, error: 'not_configured', warmed: 0 };
  }

  const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  const databases = new Databases(client);
  const referenceMonth = currentMonthYm();
  let warmed = 0;
  let skipped = 0;
  let errors = 0;

  const list = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
    Query.equal('status', ['active']),
    Query.limit(100),
  ]);

  for (const academy of list.documents || []) {
    if (warmed >= MAX_WARM_PER_RUN) {
      skipped += 1;
      continue;
    }
    if (!academyHasFinanceModule(academy)) continue;

    const academyId = academy.$id;
    try {
      const financeConfig = mergeFinanceConfigFromAcademyDoc(academy);
      await loadReceivablesSnapshotBundle({
        academyId,
        referenceMonth,
        financeConfig,
        includeCobranca: true,
      });
      warmed += 1;
    } catch (e) {
      errors += 1;
      console.warn(
        JSON.stringify({
          event: 'finance_receivables_warm_error',
          academyId,
          month: referenceMonth,
          error: e?.message || String(e),
        })
      );
    }
  }

  return {
    ok: true,
    referenceMonth,
    warmed,
    skipped,
    errors,
    candidates: (list.documents || []).filter((a) => academyHasFinanceModule(a)).length,
  };
}
