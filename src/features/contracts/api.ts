import type {
  ContractsListResponse,
  ContractDetailResponse,
  CreateContractResponse,
} from './types.js';
import type { SignerInput } from '../../../lib/contracts/types.js';

export interface FetchContractsParams {
  status?: string;
  page?: number;
  limit?: number;
}

export async function fetchContracts(params: FetchContractsParams = {}): Promise<ContractsListResponse> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await fetch(`/api/contracts?${qs.toString()}`);
  const data = (await res.json()) as ContractsListResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

export async function fetchContractById(id: string): Promise<ContractDetailResponse['contract']> {
  const res = await fetch(`/api/contracts/${encodeURIComponent(id)}`);
  const data = (await res.json()) as ContractDetailResponse;
  if (!res.ok || !data.ok || !data.contract) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data.contract;
}

export async function createContractRequest(input: {
  name: string;
  signers: SignerInput[];
  file: File;
  sandbox: boolean;
}): Promise<CreateContractResponse> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('signers', JSON.stringify(input.signers));
  formData.append('file', input.file, input.file.name || 'contrato.pdf');
  formData.append('sandbox', input.sandbox ? 'true' : 'false');

  const res = await fetch('/api/contracts', { method: 'POST', body: formData });
  const data = (await res.json()) as CreateContractResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || data.detail || `Erro HTTP ${res.status}`);
  }
  return data;
}
