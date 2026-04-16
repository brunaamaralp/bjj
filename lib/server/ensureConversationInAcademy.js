/**
 * Garante que o documento de conversa existe e pertence à academia indicada.
 * @param {import('node-appwrite').Databases} databases
 * @param {string} dbId
 * @param {string} conversationsCol
 * @param {string} conversationId
 * @param {string} academyId
 */
export async function ensureConversationBelongsToAcademy(databases, dbId, conversationsCol, conversationId, academyId) {
  const cid = String(conversationId || '').trim();
  const aid = String(academyId || '').trim();
  if (!cid || !aid || !conversationsCol || !dbId || !databases) return { ok: false };
  try {
    const conv = await databases.getDocument(dbId, conversationsCol, cid);
    if (String(conv?.academy_id || '') !== aid) return { ok: false };
    return { ok: true, conv };
  } catch {
    return { ok: false };
  }
}
