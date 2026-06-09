import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchContracts,
  fetchContractById,
  createContractRequest,
  cancelContractRequest,
  fetchContractAutentiqueMeta,
} from './api.js';
import {
  fetchContractTemplates,
  createContractTemplateRequest,
  updateContractTemplateRequest,
  deleteContractTemplateRequest,
  ensureAcademyContractSetupRequest,
} from './templatesApi.js';
import type { FetchContractsParams } from './api.js';
import type { SignerInput } from './types.js';
import { mapContractDisplayStatusForRecord } from './status.js';
import type { ContractRecord } from '../../../lib/contracts/types.js';
import type { ContractTemplatePurpose } from '../../../lib/contracts/contractTemplatePurpose.js';
import { useLeadStore } from '../../store/useLeadStore.js';

export const contractKeys = {
  all: (academyId: string) => ['contracts', academyId] as const,
  list: (academyId: string, params: FetchContractsParams) =>
    [...contractKeys.all(academyId), 'list', params] as const,
  detail: (academyId: string, id: string) => [...contractKeys.all(academyId), 'detail', id] as const,
  templates: (academyId: string, activeOnly?: boolean) =>
    [...contractKeys.all(academyId), 'templates', { activeOnly }] as const,
  autentiqueMeta: (academyId: string) => [...contractKeys.all(academyId), 'autentique-meta'] as const,
};

function contractsAcademyId() {
  return String(useLeadStore.getState().academyId || '').trim();
}

export function useContractAutentiqueMeta(enabled = true) {
  const academyId = useLeadStore((s) => s.academyId) || '';
  return useQuery({
    queryKey: contractKeys.autentiqueMeta(academyId),
    queryFn: () => fetchContractAutentiqueMeta(),
    enabled: enabled && Boolean(academyId),
    staleTime: 60_000,
  });
}

function contractListNeedsPolling(rows: ContractRecord[] | undefined): number | false {
  const list = rows || [];
  const pending = list.some((c) => {
    const d = mapContractDisplayStatusForRecord(c);
    return d === 'sent' || d === 'viewed';
  });
  return pending ? 30_000 : false;
}

export function useContractsList(params: FetchContractsParams) {
  const academyId = useLeadStore((s) => s.academyId) || '';
  return useQuery({
    queryKey: contractKeys.list(academyId, params),
    queryFn: () => fetchContracts(params),
    enabled: Boolean(academyId),
    refetchInterval: (query) => contractListNeedsPolling(query.state.data?.data),
  });
}

export function useContractDetail(id: string | null, enabled = true) {
  const academyId = useLeadStore((s) => s.academyId) || '';
  return useQuery({
    queryKey: contractKeys.detail(academyId, id || ''),
    queryFn: () => fetchContractById(id!),
    enabled: Boolean(academyId) && Boolean(id) && enabled,
  });
}

export function useCancelContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelContractRequest(id),
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (aid) queryClient.invalidateQueries({ queryKey: contractKeys.all(aid) });
    },
  });
}

export function useCreateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      name: string;
      signers: SignerInput[];
      templateId: string;
      sandbox: boolean;
      leadId?: string;
      contractPurpose?: ContractTemplatePurpose;
      autoSignAcademy?: boolean;
    }) => createContractRequest(input),
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (aid) queryClient.invalidateQueries({ queryKey: contractKeys.all(aid) });
    },
  });
}

export function useContractTemplates(activeOnly = false) {
  const academyId = useLeadStore((s) => s.academyId) || '';
  return useQuery({
    queryKey: contractKeys.templates(academyId, activeOnly),
    queryFn: () => fetchContractTemplates({ activeOnly }),
    enabled: Boolean(academyId),
    staleTime: 60_000,
    retry: 2,
  });
}

export function useCreateContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContractTemplateRequest,
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (aid) queryClient.invalidateQueries({ queryKey: contractKeys.all(aid) });
    },
  });
}

export function useUpdateContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      id: string;
      patch: Parameters<typeof updateContractTemplateRequest>[1];
    }) => updateContractTemplateRequest(input.id, input.patch),
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (aid) queryClient.invalidateQueries({ queryKey: contractKeys.all(aid) });
    },
  });
}

export function useDeleteContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContractTemplateRequest,
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (aid) queryClient.invalidateQueries({ queryKey: contractKeys.all(aid) });
    },
  });
}

export function useEnsureAcademyContractSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ensureAcademyContractSetupRequest,
    onSuccess: () => {
      const aid = contractsAcademyId();
      if (!aid) return;
      queryClient.invalidateQueries({
        predicate: (query) =>
          Array.isArray(query.queryKey) &&
          query.queryKey[0] === 'contracts' &&
          query.queryKey[1] === aid &&
          query.queryKey[2] === 'templates',
      });
    },
  });
}
