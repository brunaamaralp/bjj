import { Client, Databases, Query, ID } from 'node-appwrite';
import { Permission, Role } from 'node-appwrite';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';

const SUBS_COL = () =>
  String(process.env.APPWRITE_BILLING_SUBSCRIPTIONS_COLLECTION_ID || '').trim();
const PAY_COL = () => String(process.env.APPWRITE_BILLING_PAYMENTS_COLLECTION_ID || '').trim();
const IDEM_COL = () => String(process.env.APPWRITE_BILLING_IDEMPOTENCY_COLLECTION_ID || '').trim();

/** @type {Databases | null} */
let cachedDb = null;

export function getBillingDatabases() {
  if (!PROJECT_ID || !API_KEY) return null;
  if (!cachedDb) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    cachedDb = new Databases(client);
  }
  return cachedDb;
}

export function isBillingStoreConfigured() {
  return Boolean(DB_ID && SUBS_COL() && PAY_COL() && IDEM_COL() && getBillingDatabases());
}

function billingPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

/** @param {Record<string, unknown>} doc */
export function mapSubscriptionDoc(doc) {
  if (!doc) return null;
  const end = doc.currentPeriodEnd ? new Date(doc.currentPeriodEnd) : null;
  const cancel = doc.cancelAtPeriodEnd === true || doc.cancelAtPeriodEnd === 'true';
  return {
    $id: doc.$id,
    storeId: String(doc.storeId || ''),
    asaasCustomerId: doc.asaasCustomerId ? String(doc.asaasCustomerId) : null,
    asaasSubscriptionId: doc.asaasSubscriptionId ? String(doc.asaasSubscriptionId) : null,
    status: String(doc.status || ''),
    currentPeriodEnd: end && !Number.isNaN(end.getTime()) ? end : null,
    cancelAtPeriodEnd: cancel,
  };
}

/**
 * @param {Databases} databases
 * @param {string} storeId
 */
export async function findSubscriptionByStoreId(databases, storeId) {
  const list = await databases.listDocuments(DB_ID, SUBS_COL(), [
    Query.equal('storeId', [String(storeId)]),
    Query.limit(1),
  ]);
  const doc = list.documents?.[0];
  return mapSubscriptionDoc(doc);
}

/**
 * @param {Databases} databases
 * @param {string} asaasSubscriptionId
 */
export async function findSubscriptionByAsaasSubscriptionId(databases, asaasSubscriptionId) {
  const list = await databases.listDocuments(DB_ID, SUBS_COL(), [
    Query.equal('asaasSubscriptionId', [String(asaasSubscriptionId)]),
    Query.limit(1),
  ]);
  return mapSubscriptionDoc(list.documents?.[0]);
}

/**
 * @param {Databases} databases
 * @param {string} asaasCustomerId
 */
export async function findSubscriptionByAsaasCustomerId(databases, asaasCustomerId) {
  const list = await databases.listDocuments(DB_ID, SUBS_COL(), [
    Query.equal('asaasCustomerId', [String(asaasCustomerId)]),
    Query.limit(1),
  ]);
  return mapSubscriptionDoc(list.documents?.[0]);
}

/**
 * @param {Databases} databases
 * @param {string} taxDigits
 * @param {string} excludeStoreId
 */
export async function findOtherStoreWithTaxDocument(databases, taxDigits, excludeStoreId) {
  const list = await databases.listDocuments(DB_ID, SUBS_COL(), [
    Query.equal('taxDocumentDigits', [String(taxDigits)]),
    Query.limit(5),
  ]);
  const ex = String(excludeStoreId || '');
  for (const doc of list.documents || []) {
    if (String(doc.storeId || '') !== ex) return mapSubscriptionDoc(doc);
  }
  return null;
}

/**
 * @param {Databases} databases
 * @param {object} data
 */
export async function createSubscriptionDocument(databases, data) {
  const payload = {
    storeId: String(data.storeId),
    status: String(data.status),
    currentPeriodEnd: data.currentPeriodEnd ? new Date(data.currentPeriodEnd).toISOString() : null,
    cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
  };
  if (data.asaasCustomerId) payload.asaasCustomerId = String(data.asaasCustomerId);
  if (data.asaasSubscriptionId) payload.asaasSubscriptionId = String(data.asaasSubscriptionId);
  if (data.taxDocumentDigits) payload.taxDocumentDigits = String(data.taxDocumentDigits);
  const doc = await databases.createDocument(DB_ID, SUBS_COL(), ID.unique(), payload, billingPerms());
  return mapSubscriptionDoc(doc);
}

/**
 * @param {Databases} databases
 * @param {string} docId
 * @param {object} patch
 */
export async function updateSubscriptionDocument(databases, docId, patch) {
  const data = {};
  if ('status' in patch) data.status = String(patch.status);
  if ('currentPeriodEnd' in patch) {
    data.currentPeriodEnd = patch.currentPeriodEnd
      ? new Date(patch.currentPeriodEnd).toISOString()
      : null;
  }
  if ('cancelAtPeriodEnd' in patch) data.cancelAtPeriodEnd = Boolean(patch.cancelAtPeriodEnd);
  if ('asaasCustomerId' in patch) {
    if (patch.asaasCustomerId) data.asaasCustomerId = String(patch.asaasCustomerId);
    else data.asaasCustomerId = '';
  }
  if ('asaasSubscriptionId' in patch) {
    if (patch.asaasSubscriptionId) data.asaasSubscriptionId = String(patch.asaasSubscriptionId);
    else data.asaasSubscriptionId = '';
  }
  if ('taxDocumentDigits' in patch) {
    if (patch.taxDocumentDigits) data.taxDocumentDigits = String(patch.taxDocumentDigits);
    else data.taxDocumentDigits = '';
  }
  const doc = await databases.updateDocument(DB_ID, SUBS_COL(), docId, data);
  return mapSubscriptionDoc(doc);
}

/**
 * @param {Databases} databases
 * @param {string} storeId
 * @param {object} patch
 */
export async function updateSubscriptionByStoreId(databases, storeId, patch) {
  const row = await findSubscriptionByStoreId(databases, storeId);
  if (!row) return null;
  return updateSubscriptionDocument(databases, row.$id, patch);
}

/**
 * @param {Databases} databases
 * @param {string} key
 */
export async function findIdempotencyByKey(databases, key) {
  const list = await databases.listDocuments(DB_ID, IDEM_COL(), [
    Query.equal('key', [String(key)]),
    Query.limit(1),
  ]);
  const doc = list.documents?.[0];
  if (!doc) return null;
  return {
    $id: doc.$id,
    key: doc.key,
    storeId: doc.storeId,
    planSlug: doc.planSlug,
    billingType: doc.billingType,
    paymentLinkUrl: doc.paymentLinkUrl ? String(doc.paymentLinkUrl) : '',
    asaasCustomerId: doc.asaasCustomerId || null,
    asaasSubscriptionId: doc.asaasSubscriptionId || null,
    createdAt: doc.$createdAt ? new Date(doc.$createdAt) : new Date(),
  };
}

/**
 * @param {Databases} databases
 * @param {string} docId
 */
export async function deleteIdempotencyDocument(databases, docId) {
  await databases.deleteDocument(DB_ID, IDEM_COL(), docId);
}

/**
 * @param {Databases} databases
 * @param {object} data
 */
export async function createIdempotencyDocument(databases, data) {
  const payload = {
    key: String(data.key),
    storeId: String(data.storeId),
    planSlug: String(data.planSlug),
    billingType: String(data.billingType),
    paymentLinkUrl: data.paymentLinkUrl ? String(data.paymentLinkUrl) : '',
    asaasCustomerId: data.asaasCustomerId ? String(data.asaasCustomerId) : '',
    asaasSubscriptionId: data.asaasSubscriptionId ? String(data.asaasSubscriptionId) : '',
  };
  await databases.createDocument(DB_ID, IDEM_COL(), ID.unique(), payload, billingPerms());
}

/**
 * @param {Databases} databases
 * @param {string} asaasPaymentId
 */
export async function findPaymentByAsaasId(databases, asaasPaymentId) {
  const list = await databases.listDocuments(DB_ID, PAY_COL(), [
    Query.equal('asaasPaymentId', [String(asaasPaymentId)]),
    Query.limit(1),
  ]);
  return list.documents?.[0] || null;
}

/**
 * @param {Databases} databases
 * @param {object} p
 */
export async function upsertSubscriptionPaymentDocument(databases, p) {
  const existing = await findPaymentByAsaasId(databases, p.asaasPaymentId);
  const valueStr = typeof p.value === 'number' ? String(p.value) : String(p.value ?? '');
  const paidIso = p.paidAt ? new Date(p.paidAt).toISOString() : new Date().toISOString();
  const payload = {
    asaasPaymentId: String(p.asaasPaymentId),
    storeId: String(p.storeId),
    value: valueStr,
    billingType: String(p.billingType || 'UNKNOWN'),
    paidAt: paidIso,
    asaasSubscriptionId: p.asaasSubscriptionId ? String(p.asaasSubscriptionId) : '',
  };
  if (existing) {
    await databases.updateDocument(DB_ID, PAY_COL(), existing.$id, payload);
  } else {
    await databases.createDocument(DB_ID, PAY_COL(), ID.unique(), payload, billingPerms());
  }
}
