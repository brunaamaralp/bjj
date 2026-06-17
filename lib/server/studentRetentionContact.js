/**
 * Flag «em contato» na retenção por frequência — limpa ao registrar novo check-in.
 */
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} studentId
 */
export async function clearRetentionInContact(databases, dbId, studentId) {
  const id = String(studentId || '').trim();
  if (!STUDENTS_COL || !dbId || !id) return false;

  try {
    const doc = await databases.getDocument(dbId, STUDENTS_COL, id);
    const patch = {};
    if (doc?.retention_in_contact === true) patch.retention_in_contact = false;
    if (doc?.retention_snoozed_until) patch.retention_snoozed_until = null;
    if (doc?.last_retention_automation_at) patch.last_retention_automation_at = null;
    if (doc?.retention_automation_anchor) patch.retention_automation_anchor = null;
    if (!Object.keys(patch).length) return false;
    await databases.updateDocument(dbId, STUDENTS_COL, id, patch);
    return true;
  } catch {
    return false;
  }
}
