import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchContracts, fetchContractById, createContractRequest } from './api.js';
import type { FetchContractsParams } from './api.js';
import type { SignerInput } from './types.js';

export const contractKeys = {
  all: ['contracts'] as const,
  list: (params: FetchContractsParams) => [...contractKeys.all, 'list', params] as const,
  detail: (id: string) => [...contractKeys.all, 'detail', id] as const,
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

export function useCreateContract() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { name: string; signers: SignerInput[]; file: File; sandbox: boolean }) =>
      createContractRequest(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: contractKeys.all });
    },
  });
}
