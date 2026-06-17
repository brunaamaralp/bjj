/**
 * Regras de pagador (auto_suggest) para conciliação P2.
 */
import { Query } from 'node-appwrite';
import { DB_ID, STUDENTS_COL } from './appwriteCollections.js';
import { parsePayerAliasesJson } from '../../src/lib/studentPayerAliases.js';
import { extractPayerNameFromDescription } from './bankStatementPayerName.js';

const MAX_RULES = 50;

/**
 * @param {string} description
 * @param {{ payer_aliases?: Array }} payerContext
 */
export function isAutoSuggestPayerRuleMatch(description, payerContext) {
  if (!payerContext?.payer_aliases?.length) return false;
  const extracted = extractPayerNameFromDescription(description);
  if (!extracted) return false;
  return payerContext.payer_aliases.some(
    (a) => a.auto_suggest && a.normalized === extracted.normalized
  );
}

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} academyId
 */
export async function listReconPayerRules(databases, academyId) {
  if (!databases || !STUDENTS_COL || !academyId) return [];

  const rules = [];
  let cursor;
  for (let page = 0; page < 20 && rules.length < MAX_RULES; page += 1) {
    const queries = [
      Query.equal('academyId', [academyId]),
      Query.limit(100),
    ];
    if (cursor) queries.push(Query.cursorAfter(cursor));
    const res = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
    const docs = res.documents || [];
    if (!docs.length) break;
    cursor = docs[docs.length - 1].$id;

    for (const doc of docs) {
      const leadId = String(doc.$id || '').trim();
      const leadName = String(doc.name || '').trim();
      const aliases = parsePayerAliasesJson(doc.payer_aliases_json);
      for (const alias of aliases) {
        if (!alias.auto_suggest) continue;
        rules.push({
          lead_id: leadId,
          lead_name: leadName,
          display: alias.display,
          normalized: alias.normalized,
        });
        if (rules.length >= MAX_RULES) break;
      }
      if (rules.length >= MAX_RULES) break;
    }
  }

  return rules;
}

/**
 * @param {Array} items — linhas do extrato
 * @param {Map<string, object>} payerContextByLeadId
 */
export function collectRulesAppliedInStatement(items, payerContextByLeadId = new Map()) {
  const seen = new Set();
  const applied = [];

  for (const item of items || []) {
    if (String(item.direction || '') !== 'credit') continue;
    const extracted = extractPayerNameFromDescription(item.description);
    if (!extracted) continue;

    for (const [leadId, ctx] of payerContextByLeadId.entries()) {
      for (const alias of ctx.payer_aliases || []) {
        if (!alias.auto_suggest || alias.normalized !== extracted.normalized) continue;
        const key = `${alias.normalized}:${leadId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        applied.push({
          normalized: alias.normalized,
          display: alias.display,
          lead_id: leadId,
          lead_name: ctx.lead_name || '',
        });
      }
    }
  }

  return applied;
}
