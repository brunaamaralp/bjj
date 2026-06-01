/**
 * Criação/atualização tolerante a atributos ausentes no schema Appwrite.
 */

const UNKNOWN_ATTR_RE = /Unknown attribute:\s*"?([^"\s]+)"?/i;

export function parseUnknownAttributeFromMessage(msg) {
  const m = String(msg || '').match(UNKNOWN_ATTR_RE);
  return m ? String(m[1] || '').trim() : null;
}

export async function createDocumentResilient(databases, dbId, colId, docId, payload, perms = undefined) {
  let data = { ...payload };
  const maxAttempts = Math.max(24, Object.keys(data).length + 4);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      if (perms) return await databases.createDocument(dbId, colId, docId, data, perms);
      return await databases.createDocument(dbId, colId, docId, data);
    } catch (err) {
      const bad = parseUnknownAttributeFromMessage(err?.message);
      if (!bad || !Object.prototype.hasOwnProperty.call(data, bad)) throw err;
      const next = { ...data };
      delete next[bad];
      data = next;
      if (!Object.keys(data).length) throw err;
    }
  }
  throw new Error('create_document_schema_incompatible');
}

export async function updateDocumentResilient(databases, dbId, colId, docId, patch) {
  let data = { ...patch };
  const maxAttempts = Math.max(16, Object.keys(data).length + 4);
  for (let i = 0; i < maxAttempts; i++) {
    try {
      return await databases.updateDocument(dbId, colId, docId, data);
    } catch (err) {
      const bad = parseUnknownAttributeFromMessage(err?.message);
      if (!bad || !Object.prototype.hasOwnProperty.call(data, bad)) throw err;
      const next = { ...data };
      delete next[bad];
      data = next;
      if (!Object.keys(data).length) throw err;
    }
  }
  throw new Error('update_document_schema_incompatible');
}
