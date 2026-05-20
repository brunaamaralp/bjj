import type { ContractRecord, ContractWithSigners, SignerInput } from '../../../lib/contracts/types.js';
import type { ContractDisplayStatus } from '../../../lib/contracts/displayStatus.js';

export type { ContractDisplayStatus };

export interface ContractListItem extends ContractRecord {
  signersTotal: number;
  signersSigned: number;
  displayStatus: ContractDisplayStatus;
  studentName?: string | null;
}

export interface ContractsListResponse {
  ok: boolean;
  data: ContractRecord[];
  page: number;
  limit: number;
  total: number;
  error?: string;
}

export interface ContractDetailResponse {
  ok: boolean;
  contract?: ContractWithSigners;
  error?: string;
}

export interface CreateContractResponse {
  ok: boolean;
  contract?: ContractRecord;
  signers?: unknown[];
  autentiqueDocument?: { id: string };
  error?: string;
  detail?: string;
}

export type { ContractWithSigners, SignerInput };
