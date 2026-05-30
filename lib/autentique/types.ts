import type { SignerInput } from '../contracts/types.js';

export interface AutentiqueSignature {
  public_id: string;
  name?: string | null;
  email?: string | null;
  created_at?: string;
  action?: { name?: string } | null;
  link?: { short_link?: string } | null;
  user?: { id?: string; name?: string; email?: string } | null;
  signed?: { created_at?: string } | null;
}

export interface AutentiqueDocument {
  id: string;
  name: string;
  refusable?: boolean;
  sortable?: boolean;
  created_at?: string;
  signatures: AutentiqueSignature[];
}

export interface CreateDocumentParams {
  name: string;
  /** Mensagem customizada no convite (e-mail / WhatsApp conforme template Autentique). */
  message?: string;
  signers: SignerInput[];
  file: Buffer | Blob;
  sandbox?: boolean;
  refusable?: boolean;
  sortable?: boolean;
}

export interface SignDocumentResult {
  id: string;
}
