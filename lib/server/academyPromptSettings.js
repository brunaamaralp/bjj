import { Client, Databases, Query } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const SETTINGS_COL = String(process.env.APPWRITE_SETTINGS_COLLECTION_ID || process.env.VITE_APPWRITE_SETTINGS_COLLECTION_ID || '').trim();
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID || process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID || '';

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(client);

function fieldsFromDoc(doc) {
  if (!doc) {
    return { intro: '', body: '', suffix: '' };
  }
  return {
    intro: String(doc.prompt_intro || '').trim(),
    body: String(doc.prompt_body || '').trim(),
    suffix: String(doc.prompt_suffix || '').trim()
  };
}

/**
 * Uma única fonte de verdade por deploy:
 * — Se APPWRITE_SETTINGS_COLLECTION_ID estiver definido: só essa coleção (sem fallback no sentinel).
 * — Caso contrário: só o documento sentinel em CONVERSATIONS (phone_number __settings__).
 */
export async function fetchAcademyPromptSettings(academyId) {
  const a = String(academyId || '').trim();
  if (!a || !DB_ID) {
    return { intro: '', body: '', suffix: '', source: 'default' };
  }
  try {
    if (SETTINGS_COL) {
      const list = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [a]), Query.limit(1)]);
      const doc = list.documents && list.documents[0] ? list.documents[0] : null;
      const f = fieldsFromDoc(doc);
      return { ...f, source: doc ? 'collection' : 'default' };
    }
    if (!CONVERSATIONS_COL) {
      return { intro: '', body: '', suffix: '', source: 'default' };
    }
    const list2 = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
      Query.equal('academy_id', [a]),
      Query.equal('phone_number', ['__settings__']),
      Query.limit(1)
    ]);
    const doc2 = list2.documents && list2.documents[0] ? list2.documents[0] : null;
    const f2 = fieldsFromDoc(doc2);
    return { ...f2, source: doc2 ? 'sentinel' : 'default' };
  } catch (e) {
    console.warn('[academyPromptSettings] erro ao ler', e?.message || e);
    return { intro: '', body: '', suffix: '', source: 'default' };
  }
}

/**
 * Para PUT de prompt: mesmo critério de armazenamento que fetchAcademyPromptSettings.
 * Retorno compatível com o handler ai-prompt (doc, coll, kind).
 */
export async function getPromptSettingsDocForSave(academyId) {
  const a = String(academyId || '').trim();
  if (!a || !DB_ID) {
    return { doc: null, coll: SETTINGS_COL || CONVERSATIONS_COL, kind: SETTINGS_COL ? 'settings' : 'conversations' };
  }
  if (SETTINGS_COL) {
    const list = await databases.listDocuments(DB_ID, SETTINGS_COL, [Query.equal('academy_id', [a]), Query.limit(1)]);
    const doc = list.documents && list.documents[0] ? list.documents[0] : null;
    return { doc, coll: SETTINGS_COL, kind: 'settings' };
  }
  if (!CONVERSATIONS_COL) {
    return { doc: null, coll: '', kind: 'conversations' };
  }
  const list2 = await databases.listDocuments(DB_ID, CONVERSATIONS_COL, [
    Query.equal('academy_id', [a]),
    Query.equal('phone_number', ['__settings__']),
    Query.limit(1)
  ]);
  const doc2 = list2.documents && list2.documents[0] ? list2.documents[0] : null;
  return { doc: doc2, coll: CONVERSATIONS_COL, kind: 'conversations' };
}
