/**
 * Criação/atualização tolerante a atributos ausentes no schema Appwrite.
 */

const UNKNOWN_ATTR_RES = [
  /Unknown attribute:\s*"?([^"\s]+)"?/i,
  /Invalid document structure:\s*Unknown attribute\s+"?([^"\s]+)"?/i,
];

const INVALID_TYPE_ATTR_RES = [
  /Invalid document structure:\s*Attribute\s+"([^"]+)"\s+has invalid type/i,
  /Invalid document structure:\s*Attribute\s+'([^']+)'\s+has invalid type/i,
];

export function sanitizeAppwritePayload(payload) {
  const out = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (value === null || value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export function parseUnknownAttributeFromMessage(msg) {
  const text = String(msg || '');
  for (const re of UNKNOWN_ATTR_RES) {
    const m = text.match(re);
    if (m) return String(m[1] || '').trim();
  }
  for (const re of INVALID_TYPE_ATTR_RES) {
    const m = text.match(re);
    if (m) return String(m[1] || '').trim();
  }
  return null;
}

export async function createDocumentResilient(databases, dbId, colId, docId, payload, perms = undefined) {
  let data = sanitizeAppwritePayload(payload);
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
  let data = sanitizeAppwritePayload(patch);
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
