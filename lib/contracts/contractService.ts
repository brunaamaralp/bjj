import { Client, Databases, Query, ID, type Models } from 'node-appwrite';
import { Permission, Role } from 'node-appwrite';
import type {
  ContractCreateInput,
  ContractEventRecord,
  ContractRecord,
  ContractWithSigners,
  ListContractsFilters,
  PaginatedContracts,
  SignerRecord,
  SignerSaveInput,
} from './types.js';
import { mapContractDisplayStatus } from './displayStatus.js';
import { parseSignersLinks } from './signersLinks.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.APPWRITE_DATABASE_ID || '';

const CONTRACTS_COL = () =>
  String(process.env.APPWRITE_CONTRACTS_COLLECTION_ID || '').trim();
const SIGNERS_COL = () =>
  String(process.env.APPWRITE_CONTRACT_SIGNERS_COLLECTION_ID || '').trim();
const EVENTS_COL = () =>
  String(process.env.APPWRITE_CONTRACT_EVENTS_COLLECTION_ID || '').trim();
const WEBHOOK_LOGS_COL = () =>
  String(process.env.APPWRITE_WEBHOOK_LOGS_COLLECTION_ID || '').trim();

let cachedDb: Databases | null = null;

function requireDb(): Databases {
  if (!PROJECT_ID || !API_KEY || !DB_ID) {
    throw new Error('contract_store_not_configured');
  }
  if (!CONTRACTS_COL() || !SIGNERS_COL()) {
    throw new Error('contract_collections_not_configured');
  }
  if (!cachedDb) {
    const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    cachedDb = new Databases(client);
  }
  return cachedDb;
}

export function isContractStoreConfigured(): boolean {
  return Boolean(
    PROJECT_ID &&
      API_KEY &&
      DB_ID &&
      CONTRACTS_COL() &&
      SIGNERS_COL() &&
      EVENTS_COL() &&
      WEBHOOK_LOGS_COL()
  );
}

function docPerms() {
  return [
    Permission.read(Role.users()),
    Permission.update(Role.users()),
    Permission.delete(Role.users()),
  ];
}

function mapContractDoc(doc: Models.Document | null): ContractRecord | null {
  if (!doc) return null;
  return {
    $id: doc.$id,
    academyId: doc.academy_id ? String(doc.academy_id) : null,
    leadId: doc.lead_id ? String(doc.lead_id) : null,
    templateId: doc.template_id ? String(doc.template_id) : null,
    autentiqueId: doc.autentique_id ? String(doc.autentique_id) : null,
    name: doc.name ? String(doc.name) : '',
    status: doc.status ? String(doc.status) : 'pending',
    sandbox: doc.sandbox === true || doc.sandbox === 'true',
    signersLinks: parseSignersLinks(doc.signers_links),
    createdAt: doc.$createdAt ?? null,
    updatedAt: doc.$updatedAt ?? null,
  };
}

function mapSignerDoc(doc: Models.Document | null): SignerRecord | null {
  if (!doc) return null;
  return {
    $id: doc.$id,
    contractId: String(doc.contract_id || ''),
    autentiquePublicId: doc.autentique_public_id ? String(doc.autentique_public_id) : null,
    autentiqueDocumentId: doc.autentique_document_id ? String(doc.autentique_document_id) : null,
    email: doc.email ? String(doc.email) : null,
    name: doc.name ? String(doc.name) : null,
    phone: doc.phone ? String(doc.phone) : null,
    action: doc.action ? String(doc.action) : null,
    deliveryMethod: doc.delivery_method ? String(doc.delivery_method) : null,
    status: doc.status ? String(doc.status) : 'pending',
    signedAt: doc.signed_at ? String(doc.signed_at) : null,
  };
}

export async function createContract(data: ContractCreateInput): Promise<ContractRecord> {
  const databases = requireDb();
  const payload: Record<string, unknown> = {
    name: String(data.name || ''),
    status: String(data.status || 'pending'),
    sandbox: Boolean(data.sandbox),
  };
  if (data.academy_id) payload.academy_id = String(data.academy_id);
  if (data.lead_id) payload.lead_id = String(data.lead_id);
  if (data.template_id) payload.template_id = String(data.template_id);
  if (data.autentique_id) payload.autentique_id = String(data.autentique_id);
  if (data.signers_links) payload.signers_links = String(data.signers_links).slice(0, 2048);

  const doc = await databases.createDocument(DB_ID, CONTRACTS_COL(), ID.unique(), payload, docPerms());
  const mapped = mapContractDoc(doc);
  if (!mapped) throw new Error('contract_create_failed');
  return mapped;
}

export async function saveSigners(contractId: string, signers: SignerSaveInput[]): Promise<SignerRecord[]> {
  const databases = requireDb();
  const saved: SignerRecord[] = [];

  for (const s of signers) {
    const payload: Record<string, unknown> = {
      contract_id: String(contractId),
      status: String(s.status || 'pending'),
    };
    if (s.autentique_public_id) payload.autentique_public_id = String(s.autentique_public_id);
    if (s.autentique_document_id) payload.autentique_document_id = String(s.autentique_document_id);
    if (s.email) payload.email = String(s.email);
    if (s.name) payload.name = String(s.name);
    if (s.phone) payload.phone = String(s.phone);
    if (s.action) payload.action = String(s.action);
    if (s.delivery_method) payload.delivery_method = String(s.delivery_method);

    const doc = await databases.createDocument(DB_ID, SIGNERS_COL(), ID.unique(), payload, docPerms());
    const mapped = mapSignerDoc(doc);
    if (mapped) saved.push(mapped);
  }

  return saved;
}

export async function updateContractStatus(autentiqueId: string, status: string): Promise<ContractRecord | null> {
  const databases = requireDb();
  const contract = await getContractByAutentiqueId(autentiqueId);
  if (!contract) return null;

  const doc = await databases.updateDocument(DB_ID, CONTRACTS_COL(), contract.$id, {
    status: String(status),
  });
  return mapContractDoc(doc);
}

export async function updateSignerStatus(
  publicId: string,
  status: string,
  signedAt?: string | null
): Promise<SignerRecord | null> {
  const databases = requireDb();
  const list = await databases.listDocuments(DB_ID, SIGNERS_COL(), [
    Query.equal('autentique_public_id', [String(publicId)]),
    Query.limit(1),
  ]);

  const row = list.documents?.[0];
  if (!row) return null;

  const data: Record<string, unknown> = { status: String(status) };
  if (signedAt) data.signed_at = String(signedAt);

  const doc = await databases.updateDocument(DB_ID, SIGNERS_COL(), row.$id, data);
  return mapSignerDoc(doc);
}

export async function getContractByAutentiqueId(autentiqueId: string): Promise<ContractRecord | null> {
  const databases = requireDb();
  const list = await databases.listDocuments(DB_ID, CONTRACTS_COL(), [
    Query.equal('autentique_id', [String(autentiqueId)]),
    Query.limit(1),
  ]);
  return mapContractDoc(list.documents?.[0] ?? null);
}

async function listContractEvents(contractId: string): Promise<ContractEventRecord[]> {
  const databases = requireDb();
  const list = await databases.listDocuments(DB_ID, EVENTS_COL(), [
    Query.equal('contract_id', [String(contractId)]),
    Query.orderDesc('$createdAt'),
    Query.limit(100),
  ]);

  return (list.documents || []).map((doc) => {
    let payload: unknown = {};
    try {
      payload = doc.payload_json ? JSON.parse(String(doc.payload_json)) : {};
    } catch {
      payload = { raw: doc.payload_json };
    }
    return {
      $id: doc.$id,
      contractId: String(doc.contract_id),
      eventType: String(doc.event_type || ''),
      autentiqueEventId: doc.autentique_event_id ? String(doc.autentique_event_id) : null,
      autentiqueDocumentId: doc.autentique_document_id ? String(doc.autentique_document_id) : null,
      payload,
      createdAt: doc.$createdAt ?? null,
    };
  });
}

async function attachSignerStats(contracts: ContractRecord[]): Promise<ContractRecord[]> {
  if (!contracts.length) return contracts;
  const databases = requireDb();
  const ids = contracts.map((c) => c.$id);
  const list = await databases.listDocuments(DB_ID, SIGNERS_COL(), [
    Query.equal('contract_id', ids),
    Query.limit(500),
  ]);

  const stats = new Map<string, { total: number; signed: number }>();
  for (const id of ids) stats.set(id, { total: 0, signed: 0 });

  for (const doc of list.documents || []) {
    const cid = String(doc.contract_id || '');
    const row = stats.get(cid);
    if (!row) continue;
    row.total += 1;
    const st = String(doc.status || '').toLowerCase();
    if (st === 'signed' || st === 'accepted') row.signed += 1;
  }

  return contracts.map((c) => {
    const s = stats.get(c.$id) || { total: 0, signed: 0 };
    return { ...c, signersTotal: s.total, signersSigned: s.signed };
  });
}

export async function getContractById(id: string): Promise<ContractWithSigners | null> {
  const databases = requireDb();
  try {
    const doc = await databases.getDocument(DB_ID, CONTRACTS_COL(), id);
    const contract = mapContractDoc(doc);
    if (!contract) return null;
    const signers = await listSignersByContractId(id);
    const events = await listContractEvents(id);
    const [withStats] = await attachSignerStats([contract]);
    return { ...withStats, signers, events };
  } catch {
    return null;
  }
}

export async function listSignersByContractId(contractId: string): Promise<SignerRecord[]> {
  const databases = requireDb();
  const list = await databases.listDocuments(DB_ID, SIGNERS_COL(), [
    Query.equal('contract_id', [String(contractId)]),
    Query.limit(100),
  ]);
  return (list.documents || []).map((d) => mapSignerDoc(d)).filter((s): s is SignerRecord => Boolean(s));
}

export async function listContracts(filters: ListContractsFilters = {}): Promise<PaginatedContracts> {
  const databases = requireDb();
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 20));
  const displayStatus = filters.display_status ? String(filters.display_status).trim() : '';

  const queries: string[] = [Query.orderDesc('$createdAt')];

  if (filters.academy_id) {
    queries.unshift(Query.equal('academy_id', [String(filters.academy_id)]));
  }
  if (filters.lead_id) {
    queries.unshift(Query.equal('lead_id', [String(filters.lead_id)]));
  }

  if (displayStatus) {
    queries.push(Query.limit(500));
    const list = await databases.listDocuments(DB_ID, CONTRACTS_COL(), queries);
    const mapped = (list.documents || [])
      .map((d) => mapContractDoc(d))
      .filter((c): c is ContractRecord => Boolean(c));
    const withStats = await attachSignerStats(mapped);
    const filtered = withStats.filter((c) => {
      const display = mapContractDisplayStatus(
        c.status,
        c.signersSigned ?? 0,
        c.signersTotal ?? 0
      );
      return display === displayStatus;
    });
    const total = filtered.length;
    const offset = (page - 1) * limit;
    return {
      data: filtered.slice(offset, offset + limit),
      page,
      limit,
      total,
    };
  }

  queries.push(Query.limit(limit));
  queries.push(Query.offset((page - 1) * limit));

  const list = await databases.listDocuments(DB_ID, CONTRACTS_COL(), queries);
  const mapped = (list.documents || []).map((d) => mapContractDoc(d)).filter((c): c is ContractRecord => Boolean(c));
  const data = await attachSignerStats(mapped);

  return {
    data,
    page,
    limit,
    total: list.total ?? data.length,
  };
}

/** @internal webhook */
export async function saveContractEvent(data: {
  contract_id: string;
  event_type: string;
  payload: unknown;
  autentique_event_id?: string;
  autentique_document_id?: string;
}) {
  const databases = requireDb();
  const payload: Record<string, unknown> = {
    contract_id: String(data.contract_id),
    event_type: String(data.event_type || ''),
    payload_json: typeof data.payload === 'string' ? data.payload : JSON.stringify(data.payload || {}),
  };
  if (data.autentique_event_id) payload.autentique_event_id = String(data.autentique_event_id);
  if (data.autentique_document_id) payload.autentique_document_id = String(data.autentique_document_id);

  const doc = await databases.createDocument(DB_ID, EVENTS_COL(), ID.unique(), payload, docPerms());
  return { $id: doc.$id };
}

/** @internal webhook */
export async function saveWebhookLog(data: {
  raw_payload: string;
  signature_valid: boolean;
  processed: boolean;
  event_type?: string;
  error?: string;
}) {
  const databases = requireDb();
  const payload: Record<string, unknown> = {
    raw_payload: data.raw_payload,
    signature_valid: Boolean(data.signature_valid),
    processed: Boolean(data.processed),
  };
  if (data.error) payload.error = String(data.error).slice(0, 2000);
  if (data.event_type) payload.event_type = String(data.event_type);

  const doc = await databases.createDocument(DB_ID, WEBHOOK_LOGS_COL(), ID.unique(), payload, docPerms());
  return { $id: doc.$id };
}

/** @internal webhook */
export async function updateWebhookLog(
  logId: string,
  patch: { processed?: boolean; error?: string; signature_valid?: boolean }
) {
  const databases = requireDb();
  const data: Record<string, unknown> = {};
  if ('processed' in patch) data.processed = Boolean(patch.processed);
  if ('error' in patch) data.error = patch.error ? String(patch.error).slice(0, 2000) : '';
  if ('signature_valid' in patch) data.signature_valid = Boolean(patch.signature_valid);
  await databases.updateDocument(DB_ID, WEBHOOK_LOGS_COL(), logId, data);
}
