/**
 * Bucket único de Storage do projeto NAVE (plano Free: 1 bucket).
 * Prefixo no fileId distingue o tipo (stu_, prd_, inb_, ctr_).
 */
export const STORAGE_BUCKET_ID = 'files';

/** Prefixo → tipo de arquivo (novos uploads + migração). */
export const STORAGE_FILE_PREFIX = Object.freeze({
  inbox: 'inb',
  /** Bucket legado duplicado de inbox (só migração). */
  inboxDup: 'inb2',
  product: 'prd',
  student: 'stu',
  contract: 'ctr',
});

const MAX_FILE_ID_LEN = 36;

/**
 * Gera fileId com prefixo, truncado em 36 chars (limite Appwrite).
 * @param {string} prefix
 * @param {() => string} [idFactory]
 */
export function makeStorageFileId(prefix, idFactory) {
  const p = String(prefix || '')
    .trim()
    .replace(/_+$/, '');
  const base = p ? `${p}_` : '';
  const unique = String(typeof idFactory === 'function' ? idFactory() : '').trim();
  if (!unique) {
    throw new Error('makeStorageFileId: idFactory obrigatório');
  }
  const candidate = `${base}${unique}`;
  if (candidate.length <= MAX_FILE_ID_LEN) return candidate;
  const maxUnique = MAX_FILE_ID_LEN - base.length;
  if (maxUnique < 1) return unique.slice(0, MAX_FILE_ID_LEN);
  return `${base}${unique.slice(0, maxUnique)}`;
}

/**
 * Novo fileId na migração: `${prefix}_${oldId}` se couber; senão prefixo + idFactory.
 * @param {string} prefix
 * @param {string} oldId
 * @param {() => string} idFactory
 */
export function migrateStorageFileId(prefix, oldId, idFactory) {
  const p = String(prefix || '')
    .trim()
    .replace(/_+$/, '');
  const old = String(oldId || '').trim();
  const candidate = `${p}_${old}`;
  if (candidate.length <= MAX_FILE_ID_LEN) return candidate;
  return makeStorageFileId(p, idFactory);
}
