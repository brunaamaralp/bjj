import type {
  ContractsListResponse,
  ContractDetailResponse,
  CreateContractResponse,
} from './types.js';
import type { SignerInput } from '../../../lib/contracts/types.js';
import { createSessionJwt } from '../../lib/appwrite.js';
import { useLeadStore } from '../../store/useLeadStore.js';

export interface FetchContractsParams {
  status?: string;
  leadId?: string;
  page?: number;
  limit?: number;
}

async function contractsFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new Error('academy_required');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${jwt}`);
  headers.set('x-academy-id', String(academyId));

  return fetch(path, { ...options, headers });
}

export async function fetchContracts(params: FetchContractsParams = {}): Promise<ContractsListResponse> {
  const qs = new URLSearchParams();
  if (params.status && params.status !== 'all') qs.set('status', params.status);
  if (params.leadId) qs.set('leadId', params.leadId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));

  const res = await contractsFetch(`/api/contracts?${qs.toString()}`);
  const data = (await res.json()) as ContractsListResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

export async function fetchContractById(id: string): Promise<ContractDetailResponse['contract']> {
  const res = await contractsFetch(`/api/contracts?id=${encodeURIComponent(id)}`);
  const data = (await res.json()) as ContractDetailResponse;
  if (!res.ok || !data.ok || !data.contract) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data.contract;
}

export async function createContractRequest(input: {
  name: string;
  signers: SignerInput[];
  file?: File;
  templateId?: string;
  sandbox: boolean;
  leadId?: string;
}): Promise<CreateContractResponse> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('signers', JSON.stringify(input.signers));
  if (input.file) formData.append('file', input.file, input.file.name || 'contrato.pdf');
  if (input.templateId) formData.append('template_id', input.templateId);
  formData.append('sandbox', input.sandbox ? 'true' : 'false');
  if (input.leadId) formData.append('lead_id', input.leadId);

  const res = await contractsFetch('/api/contracts', { method: 'POST', body: formData });
  const data = (await res.json()) as CreateContractResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || data.detail || `Erro HTTP ${res.status}`);
  }
  return data;
}
