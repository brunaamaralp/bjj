import type {
  ContractsListResponse,
  ContractDetailResponse,
  CreateContractResponse,
} from './types.js';
import type { SignerInput } from '../../../lib/contracts/types.js';
import type { ContractTemplatePurpose } from '../../../lib/contracts/contractTemplatePurpose.js';
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

export async function fetchContractById(
  id: string,
  opts: { sync?: boolean } = {}
): Promise<ContractDetailResponse['contract']> {
  const qs = new URLSearchParams();
  if (opts.sync) qs.set('sync', '1');
  const suffix = qs.toString() ? `&${qs.toString()}` : '';
  const res = await contractsFetch(`/api/contracts?id=${encodeURIComponent(id)}${suffix}`);
  const data = (await res.json()) as ContractDetailResponse;
  if (!res.ok || !data.ok || !data.contract) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data.contract;
}

export async function syncContractById(id: string): Promise<ContractDetailResponse['contract']> {
  return fetchContractById(id, { sync: true });
}

export async function previewContractRequest(input: {
  signers: SignerInput[];
  templateId: string;
  leadId?: string;
  name?: string;
}): Promise<{ ok: boolean; pdfBase64?: string; error?: string }> {
  const formData = new FormData();
  formData.append('name', input.name || 'Prévia');
  formData.append('signers', JSON.stringify(input.signers));
  formData.append('template_id', input.templateId);
  formData.append('action', 'preview');
  if (input.leadId) formData.append('lead_id', input.leadId);

  const res = await contractsFetch('/api/contracts?action=preview', { method: 'POST', body: formData });
  const data = (await res.json()) as { ok: boolean; pdfBase64?: string; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data;
}

export async function cancelContractRequest(id: string): Promise<void> {
  const res = await contractsFetch(`/api/contracts?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel' }),
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
}

export async function createContractRequest(input: {
  name: string;
  signers: SignerInput[];
  templateId: string;
  sandbox: boolean;
  leadId?: string;
  contractPurpose?: ContractTemplatePurpose;
}): Promise<CreateContractResponse> {
  const formData = new FormData();
  formData.append('name', input.name);
  formData.append('signers', JSON.stringify(input.signers));
  formData.append('template_id', input.templateId);
  formData.append('sandbox', input.sandbox ? 'true' : 'false');
  if (input.contractPurpose) formData.append('contract_purpose', input.contractPurpose);
  if (input.leadId) formData.append('lead_id', input.leadId);

  const res = await contractsFetch('/api/contracts', { method: 'POST', body: formData });
  const data = (await res.json()) as CreateContractResponse & {
    detail?: string;
    hints?: string[];
  };
  if (!res.ok || !data.ok) {
    const parts = [data.error, data.detail, ...(data.hints || [])].filter(Boolean);
    throw new Error(parts.join('\n') || `Erro HTTP ${res.status}`);
  }
  return data;
}
