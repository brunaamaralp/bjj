import type { SignerLinkEntry } from './signersLinks.js';

export interface AutentiquePosition {
  x: string;
  y: string;
  z: number;
  element: 'SIGNATURE' | 'NAME' | 'DATE' | 'CPF' | 'INITIALS';
}

export interface SignerInput {
  email?: string;
  name?: string;
  phone?: string;
  action?: string;
  delivery_method?: string;
  positions?: AutentiquePosition[];
}

export interface ContractCreateInput {
  name: string;
  autentique_id?: string;
  status?: string;
  sandbox?: boolean;
  academy_id?: string;
  lead_id?: string;
  template_id?: string;
  signers_links?: string;
  expires_at?: string;
  meta_status?: string;
}

export interface SignerSaveInput {
  autentique_public_id?: string;
  autentique_document_id?: string;
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  action?: string | null;
  delivery_method?: string | null;
  status?: string;
  signed_at?: string | null;
}

export interface ContractRecord {
  $id: string;
  academyId: string | null;
  leadId: string | null;
  templateId: string | null;
  autentiqueId: string | null;
  name: string;
  status: string;
  sandbox: boolean;
  signersLinks?: SignerLinkEntry[];
  createdAt: string | null;
  updatedAt: string | null;
  signersTotal?: number;
  signersSigned?: number;
  signersViewed?: number;
  expiresAt?: string | null;
  metaStatus?: string | null;
}

export interface ContractEventRecord {
  $id: string;
  contractId: string;
  eventType: string;
  autentiqueEventId: string | null;
  autentiqueDocumentId: string | null;
  payload: unknown;
  createdAt: string | null;
}

export interface SignerRecord {
  $id: string;
  contractId: string;
  autentiquePublicId: string | null;
  autentiqueDocumentId: string | null;
  email: string | null;
  name: string | null;
  phone: string | null;
  action: string | null;
  deliveryMethod: string | null;
  status: string;
  signedAt: string | null;
}

export interface ContractWithSigners extends ContractRecord {
  signers: SignerRecord[];
  events?: ContractEventRecord[];
}

export interface ListContractsFilters {
  /** Status de exibição: sent, viewed, signed, expired, cancelled */
  display_status?: string;
  page?: number;
  limit?: number;
  academy_id?: string;
  lead_id?: string;
}

export interface PaginatedContracts {
  data: ContractRecord[];
  page: number;
  limit: number;
  total: number;
}

export interface SignContractData {
  name: string;
  message?: string;
  signers: SignerInput[];
  sandbox?: boolean;
  academy_id?: string;
  lead_id?: string;
  template_id?: string;
  expires_at?: string;
  /** Assina a contratada (conta do token) logo após criar o documento. */
  autoSignAcademy?: boolean;
}

export type SignContractAutoSignResult = {
  applied: boolean;
  warning?: string;
};

export interface SignContractResult {
  contract: ContractRecord | null;
  autentiqueDocument: import('../autentique/types.js').AutentiqueDocument;
  signers: SignerRecord[];
  appwriteError?: string;
  autoSign?: SignContractAutoSignResult;
}
