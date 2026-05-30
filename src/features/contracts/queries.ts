import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchContracts,
  fetchContractById,
  createContractRequest,
  cancelContractRequest,
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
import type { ContractTemplatePurpose } from '../../../lib/contracts/contractTemplatePurpose.js';

export const contractKeys = {
  all: ['contracts'] as const,
  list: (params: FetchContractsParams) => [...contractKeys.all, 'list', params] as const,
  detail: (id: string) => [...contractKeys.all, 'detail', id] as const,
  templates: (activeOnly?: boolean) => [...contractKeys.all, 'templates', { activeOnly }] as const,
};

export function useContractsList(params: FetchContractsParams) {
  return useQuery({
    queryKey: contractKeys.list(params),
    queryFn: () => fetchContracts(params),
  });
}

export function useContractDetail(id: string | null, enabled = true) {
  return useQuery({
    queryKey: contractKeys.detail(id || ''),
    queryFn: () => fetchContractById(id!),
    enabled: Boolean(id) && enabled,
  });
}

export function useCancelContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelContractRequest(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
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
    }) => createContractRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

export function useContractTemplates(activeOnly = false) {
  return useQuery({
    queryKey: contractKeys.templates(activeOnly),
    queryFn: () => fetchContractTemplates({ activeOnly }),
  });
}

export function useCreateContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createContractTemplateRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
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
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

export function useDeleteContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteContractTemplateRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}

export function useEnsureAcademyContractSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ensureAcademyContractSetupRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}
