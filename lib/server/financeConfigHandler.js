import { ensureAuth, ensureAcademyAccess, DB_ID, databases } from './academyAccess.js';
import {
  auditBankAccountsFromAcademyDoc,
  enrichFinanceConfigWithOrphanLabels,
  mergeFinanceConfigFromAcademyDoc,
} from '../../src/lib/financeConfigStorage.js';
import { hasConfiguredBankAccounts } from '../../src/lib/bankAccounts.js';
import {
  mergeCollectionIntoFinanceConfig,
  readCollectionSettingsFromAcademy,
} from '../../src/lib/collectionRules.js';
import { collectOrphanBankLabelsForAcademy } from './financeConfigOrphanLabels.js';

/**
 * GET /api/leads?route=finance-config
 * financeConfig mesclado no servidor (settings/onboarding + recuperação de rótulos legados).
 */
export default async function financeConfigHandler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;

  const { academyId, doc } = access;
  let financeConfig = mergeFinanceConfigFromAcademyDoc(doc);
  const coll = readCollectionSettingsFromAcademy(doc);
  financeConfig = mergeCollectionIntoFinanceConfig(financeConfig, coll);

  let orphanLabels = [];
  if (!hasConfiguredBankAccounts(financeConfig)) {
    orphanLabels = await collectOrphanBankLabelsForAcademy(databases, academyId, DB_ID);
    financeConfig = enrichFinanceConfigWithOrphanLabels(financeConfig, orphanLabels);
  }

  return res.status(200).json({
    ok: true,
    financeConfig,
    audit: auditBankAccountsFromAcademyDoc(doc),
    orphanLabelsRecovered: orphanLabels.length,
  });
}
