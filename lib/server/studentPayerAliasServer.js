import {
  aliasExists,
  appendPayerAlias,
  parsePayerAliasesJson,
  serializePayerAliases,
} from '../../src/lib/studentPayerAliases.js';
import { extractPayerNameFromDescription } from './bankStatementPayerName.js';
import { DB_ID, STUDENTS_COL } from './appwriteCollections.js';
import { stripUnknownStudentPatch } from '../../src/lib/studentAppwritePatch.js';

export function buildLearnPayerPayload(item, tx, payerContext = null) {
  const leadId = String(tx?.lead_id || '').trim();
  if (!leadId || String(item?.direction || '') !== 'credit') return null;

  const extracted = extractPayerNameFromDescription(item?.description);
  if (!extracted) return null;

  const aliases =
    payerContext?.payer_aliases ||
    parsePayerAliasesJson(null);

  return {
    lead_id: leadId,
    lead_name: String(tx?.lead_name || payerContext?.lead_name || '').trim(),
    extracted_display: extracted.display,
    extracted_normalized: extracted.normalized,
    already_known: aliasExists(aliases, extracted.normalized),
  };
}

export async function rememberPayerAliasForStudent(
  databases,
  academyId,
  leadId,
  display,
  source = 'learned'
) {
  if (!databases || !STUDENTS_COL || !leadId) {
    return { ok: false, error: 'not_configured' };
  }

  let doc;
  try {
    doc = await databases.getDocument(DB_ID, STUDENTS_COL, String(leadId));
  } catch {
    return { ok: false, error: 'student_not_found' };
  }

  if (String(doc.academyId || doc.academy_id || '') !== String(academyId)) {
    return { ok: false, error: 'forbidden' };
  }

  const existing = parsePayerAliasesJson(doc.payer_aliases_json);
  const result = appendPayerAlias(existing, {
    display,
    source,
    learnedAt: new Date().toISOString(),
  });

  if (result.error === 'limit_reached') {
    return { ok: false, error: 'limit_reached' };
  }
  if (!result.added && !result.updated) {
    return { ok: true, skipped: true };
  }

  const patch = { payer_aliases_json: serializePayerAliases(result.aliases) };
  try {
    await databases.updateDocument(DB_ID, STUDENTS_COL, String(leadId), patch);
  } catch (e) {
    const msg = String(e?.message || '');
    if (!/unknown attribute/i.test(msg)) throw e;
    const lean = stripUnknownStudentPatch(patch, msg);
    if (!lean.payer_aliases_json) return { ok: false, error: 'schema_missing' };
    await databases.updateDocument(DB_ID, STUDENTS_COL, String(leadId), lean);
  }

  return { ok: true, aliases: result.aliases };
}
