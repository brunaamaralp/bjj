import type { CreateDocumentParams, AutentiqueDocument } from './types.js';
import type { AutentiquePosition, SignerInput } from '../contracts/types.js';
import { normalizePhoneForAutentique } from '../contracts/normalizePhone.js';
import { humanizeAutentiqueError } from './humanizeAutentiqueError.js';

const GRAPHQL_URL = 'https://api.autentique.com.br/v2/graphql';

const CREATE_DOCUMENT_MUTATION = `mutation CreateDocumentMutation(
  $document: DocumentInput!
  $signers: [SignerInput!]!
  $file: Upload!
  $sandbox: Boolean
) {
  createDocument(
    document: $document
    signers: $signers
    file: $file
    sandbox: $sandbox
  ) {
    id
    name
    refusable
    sortable
    created_at
    signatures {
      public_id
      name
      email
      created_at
      action { name }
      link { short_link }
      user { id name email }
    }
  }
}`;

function getApiToken(): string {
  const token = String(process.env.AUTENTIQUE_TOKEN || process.env.AUTENTIQUE_API_TOKEN || '').trim();
  if (!token) throw new Error('autentique_not_configured');
  return token;
}

function toUploadBlob(file: Buffer | Blob): Blob {
  if (file instanceof Blob) return file;
  if (Buffer.isBuffer(file)) return new Blob([file], { type: 'application/pdf' });
  throw new Error('file_must_be_buffer_or_blob');
}

function normalizePositions(positions: AutentiquePosition[] | undefined): AutentiquePosition[] | undefined {
  if (!Array.isArray(positions) || positions.length === 0) return undefined;
  const out: AutentiquePosition[] = [];
  for (const p of positions) {
    const x = Number(String(p.x ?? '').trim());
    const y = Number(String(p.y ?? '').trim());
    const z = Number(p.z);
    const element = String(p.element || 'SIGNATURE').trim().toUpperCase() as AutentiquePosition['element'];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || z < 1) continue;
    out.push({
      x: String(Math.min(100, Math.max(0, x))),
      y: String(Math.min(100, Math.max(0, y))),
      z: Math.floor(z),
      element,
    });
  }
  return out.length ? out : undefined;
}

function normalizeSigners(signers: SignerInput[]): SignerInput[] {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new Error('signers_required');
  }
  return signers.map((s) => {
    const row: SignerInput = { action: String(s.action || 'SIGN').toUpperCase() };
    if (s.email) row.email = String(s.email).trim();
    if (s.name) row.name = String(s.name).trim();
    if (s.phone) {
      const normalized = normalizePhoneForAutentique(s.phone);
      if (normalized) row.phone = normalized;
    }
    if (s.delivery_method) row.delivery_method = String(s.delivery_method).trim();
    const positions = normalizePositions(s.positions);
    if (positions) row.positions = positions;
    if (!row.email && !row.name && !row.phone) {
      throw new Error('signer_must_have_email_name_or_phone');
    }
    return row;
  });
}

export async function createDocument({
  name,
  signers,
  file,
  sandbox = false,
  refusable = false,
  sortable,
}: CreateDocumentParams): Promise<AutentiqueDocument> {
  const docName = String(name || '').trim();
  if (!docName) throw new Error('name_required');

  const uploadBlob = toUploadBlob(file);
  const normalizedSigners = normalizeSigners(signers);
  const useSortable = sortable ?? normalizedSigners.length > 1;

  const operations = {
    query: CREATE_DOCUMENT_MUTATION,
    variables: {
      document: { name: docName, refusable: Boolean(refusable), sortable: useSortable },
      signers: normalizedSigners,
      file: null,
      sandbox: Boolean(sandbox),
    },
  };

  const form = new FormData();
  form.append('operations', JSON.stringify(operations));
  form.append('map', JSON.stringify({ file: ['variables.file'] }));
  form.append('file', uploadBlob, 'document.pdf');

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiToken()}` },
    body: form,
  });

  const text = await res.text();
  let data: { data?: { createDocument?: AutentiqueDocument }; errors?: Array<{ message?: string }>; raw?: string } | null =
    null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const raw = data?.errors?.[0]?.message || `Autentique HTTP ${res.status}`;
    const err = new Error(humanizeAutentiqueError(raw)) as Error & {
      status?: number;
      autentique?: unknown;
      autentiqueCode?: string;
    };
    err.status = res.status;
    err.autentique = data;
    err.autentiqueCode = raw;
    throw err;
  }

  if (data?.errors?.length) {
    const raw = data.errors[0]?.message || 'autentique_graphql_error';
    const err = new Error(humanizeAutentiqueError(raw)) as Error & {
      autentique?: unknown;
      autentiqueCode?: string;
    };
    err.autentique = data;
    err.autentiqueCode = raw;
    throw err;
  }

  const doc = data?.data?.createDocument;
  if (!doc?.id) throw new Error('autentique_empty_response');
  return doc;
}

const DELETE_DOCUMENT_MUTATION = `mutation DeleteDocument($id: UUID!) {
  deleteDocument(id: $id) {
    id
  }
}`;

/** Remove documento na Autentique (rollback após falha no Appwrite). Retorna false se a API não suportar ou falhar. */
export async function deleteDocument(documentId: string): Promise<boolean> {
  const id = String(documentId || '').trim();
  if (!id) return false;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: DELETE_DOCUMENT_MUTATION,
      variables: { id },
    }),
  });

  const text = await res.text();
  let data: { data?: { deleteDocument?: { id?: string } }; errors?: Array<{ message?: string }> } | null =
    null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return false;
  }

  if (!res.ok || data?.errors?.length) return false;
  return Boolean(data?.data?.deleteDocument?.id);
}

const GET_DOCUMENT_QUERY = `query GetAutentiqueDocument($id: UUID!) {
  document(id: $id) {
    id
    name
    created_at
    signatures {
      public_id
      name
      email
      created_at
      action { name }
      link { short_link }
      signed { created_at }
      viewed { created_at }
      rejected { created_at }
    }
  }
}`;

export interface AutentiqueDocumentSync {
  id: string;
  name?: string;
  signatures: Array<{
    public_id: string;
    name?: string | null;
    email?: string | null;
    action?: { name?: string } | null;
    link?: { short_link?: string } | null;
    signed?: { created_at?: string } | null;
    viewed?: { created_at?: string } | null;
    rejected?: { created_at?: string } | null;
  }>;
}

export async function getDocument(documentId: string): Promise<AutentiqueDocumentSync | null> {
  const id = String(documentId || '').trim();
  if (!id) return null;

  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: GET_DOCUMENT_QUERY,
      variables: { id },
    }),
  });

  const text = await res.text();
  let data: { data?: { document?: AutentiqueDocumentSync }; errors?: Array<{ message?: string }> } | null =
    null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    return null;
  }

  if (!res.ok || data?.errors?.length) return null;
  const doc = data?.data?.document;
  if (!doc?.id) return null;
  return doc;
}
