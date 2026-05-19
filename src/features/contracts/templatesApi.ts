import { createSessionJwt } from '../../lib/appwrite.js';
import { useLeadStore } from '../../store/useLeadStore.js';

export interface ContractTemplateItem {
  $id: string;
  academyId: string;
  name: string;
  description: string | null;
  kind: string;
  storageFileId: string | null;
  fileUrl: string | null;
  planNames: string[];
  isDefault: boolean;
  active: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ContractTemplatesListResponse {
  ok: boolean;
  templates?: ContractTemplateItem[];
  template?: ContractTemplateItem;
  configured?: boolean;
  error?: string;
}

async function templatesFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');

  const academyId = useLeadStore.getState().academyId;
  if (!academyId) throw new Error('academy_required');

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${jwt}`);
  headers.set('x-academy-id', String(academyId));

  return fetch(path, { ...options, headers });
}

export async function fetchContractTemplates(opts: { activeOnly?: boolean } = {}): Promise<{
  templates: ContractTemplateItem[];
  configured: boolean;
}> {
  const qs = new URLSearchParams();
  if (opts.activeOnly) qs.set('activeOnly', 'true');
  const res = await templatesFetch(`/api/contract-templates?${qs.toString()}`);
  const data = (await res.json()) as ContractTemplatesListResponse;
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return {
    templates: data.templates || [],
    configured: data.configured !== false,
  };
}

export async function createContractTemplateRequest(input: {
  name: string;
  description?: string;
  planNames?: string[];
  isDefault?: boolean;
  file: File;
}): Promise<ContractTemplateItem> {
  const formData = new FormData();
  formData.append('name', input.name);
  if (input.description) formData.append('description', input.description);
  if (input.planNames?.length) formData.append('plan_names', JSON.stringify(input.planNames));
  formData.append('is_default', input.isDefault ? 'true' : 'false');
  formData.append('file', input.file, input.file.name || 'template.pdf');

  const res = await templatesFetch('/api/contract-templates', { method: 'POST', body: formData });
  const data = (await res.json()) as ContractTemplatesListResponse;
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data.template;
}

export async function updateContractTemplateRequest(
  id: string,
  patch: {
    name?: string;
    description?: string;
    planNames?: string[];
    isDefault?: boolean;
    active?: boolean;
    file?: File;
  }
): Promise<ContractTemplateItem> {
  if (patch.file) {
    const formData = new FormData();
    if (patch.name) formData.append('name', patch.name);
    if (patch.description !== undefined) formData.append('description', patch.description);
    if (patch.planNames) formData.append('plan_names', JSON.stringify(patch.planNames));
    if (patch.isDefault !== undefined) formData.append('is_default', patch.isDefault ? 'true' : 'false');
    if (patch.active !== undefined) formData.append('active', patch.active ? 'true' : 'false');
    formData.append('file', patch.file, patch.file.name || 'template.pdf');

    const res = await templatesFetch(`/api/contract-templates?id=${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: formData,
    });
    const data = (await res.json()) as ContractTemplatesListResponse;
    if (!res.ok || !data.ok || !data.template) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data.template;
  }

  const res = await templatesFetch(`/api/contract-templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: patch.name,
      description: patch.description,
      plan_names: patch.planNames,
      is_default: patch.isDefault,
      active: patch.active,
    }),
  });
  const data = (await res.json()) as ContractTemplatesListResponse;
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return data.template;
}

export async function deleteContractTemplateRequest(id: string): Promise<void> {
  const res = await templatesFetch(`/api/contract-templates?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  const data = (await res.json()) as { ok: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
}

export function resolveTemplateIdForPlan(
  planName: string | null | undefined,
  templates: ContractTemplateItem[],
  financePlans: Array<{ name?: string; contractTemplateId?: string }> = []
): string | null {
  const plan = String(planName || '').trim();
  if (!plan) {
    const def = templates.find((t) => t.active && t.isDefault);
    return def?.$id || null;
  }

  const fin = financePlans.find((p) => String(p.name || '').trim() === plan);
  const fromPlan = String(fin?.contractTemplateId || '').trim();
  if (fromPlan && templates.some((t) => t.$id === fromPlan && t.active)) return fromPlan;

  const linked = templates.find(
    (t) =>
      t.active && t.planNames.some((n) => String(n).trim().toLowerCase() === plan.toLowerCase())
  );
  if (linked) return linked.$id;

  const def = templates.find((t) => t.active && t.isDefault);
  return def?.$id || null;
}
