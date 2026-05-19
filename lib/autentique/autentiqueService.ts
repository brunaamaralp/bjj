import type { CreateDocumentParams, AutentiqueDocument } from './types.js';
import type { SignerInput } from '../contracts/types.js';

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

function normalizeSigners(signers: SignerInput[]): SignerInput[] {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new Error('signers_required');
  }
  return signers.map((s) => {
    const row: SignerInput = { action: String(s.action || 'SIGN').toUpperCase() };
    if (s.email) row.email = String(s.email).trim();
    if (s.name) row.name = String(s.name).trim();
    if (s.phone) row.phone = String(s.phone).trim();
    if (s.delivery_method) row.delivery_method = String(s.delivery_method).trim();
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
}: CreateDocumentParams): Promise<AutentiqueDocument> {
  const docName = String(name || '').trim();
  if (!docName) throw new Error('name_required');

  const uploadBlob = toUploadBlob(file);
  const normalizedSigners = normalizeSigners(signers);

  const operations = {
    query: CREATE_DOCUMENT_MUTATION,
    variables: {
      document: { name: docName },
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
    const err = new Error(data?.errors?.[0]?.message || `Autentique HTTP ${res.status}`) as Error & {
      status?: number;
      autentique?: unknown;
    };
    err.status = res.status;
    err.autentique = data;
    throw err;
  }

  if (data?.errors?.length) {
    const err = new Error(data.errors[0]?.message || 'autentique_graphql_error') as Error & { autentique?: unknown };
    err.autentique = data;
    throw err;
  }

  const doc = data?.data?.createDocument;
  if (!doc?.id) throw new Error('autentique_empty_response');
  return doc;
}
