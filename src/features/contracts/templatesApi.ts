import { createSessionJwt } from '../../lib/appwrite.js';
import { useLeadStore } from '../../store/useLeadStore.js';

import type { ContractSignerLayout } from '../../../lib/contracts/contractSignerLayout.js';
import { parseContractSignerLayout } from '../../../lib/contracts/contractSignerLayout.js';
import { normalizeTemplatePurpose } from '../../lib/contractPlanTemplates.js';

export type ContractTemplatePurpose = 'enrollment' | 'rescission';

export interface ContractTemplateItem {
  $id: string;
  academyId: string;
  name: string;
  description: string | null;
  kind: string;
  bodyHtml: string | null;
  storageFileId: string | null;
  fileUrl: string | null;
  planNames: string[];
  purpose: ContractTemplatePurpose;
  isDefault: boolean;
  active: boolean;
  signerLayout: ContractSignerLayout;
  signerLayoutJson: string | null;
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

function mapTemplate(raw: Record<string, unknown>): ContractTemplateItem {
  const planNamesRaw = raw.planNames ?? raw.plan_names;
  let planNames: string[] = [];
  if (Array.isArray(planNamesRaw)) {
    planNames = planNamesRaw.map((x) => String(x).trim()).filter(Boolean);
  } else if (planNamesRaw != null && String(planNamesRaw).trim()) {
    try {
      const p = JSON.parse(String(planNamesRaw));
      planNames = Array.isArray(p) ? p.map((x) => String(x).trim()).filter(Boolean) : [];
    } catch {
      planNames = [];
    }
  }

  return {
    $id: String(raw.$id || ''),
    academyId: String(raw.academyId ?? raw.academy_id ?? ''),
    name: String(raw.name || ''),
    description: raw.description ? String(raw.description) : null,
    kind: String(raw.kind || 'html_editor'),
    bodyHtml: raw.bodyHtml != null ? String(raw.bodyHtml) : raw.body_html != null ? String(raw.body_html) : null,
    storageFileId:
      raw.storageFileId != null
        ? String(raw.storageFileId)
        : raw.storage_file_id != null
          ? String(raw.storage_file_id)
          : null,
    fileUrl: raw.fileUrl != null ? String(raw.fileUrl) : raw.file_url != null ? String(raw.file_url) : null,
    planNames,
    purpose: normalizeTemplatePurpose(raw.purpose) as ContractTemplatePurpose,
    isDefault: raw.isDefault === true || raw.is_default === true,
    active: raw.active !== false && raw.active !== 'false',
    signerLayoutJson:
      raw.signerLayoutJson != null
        ? String(raw.signerLayoutJson)
        : raw.signer_layout_json != null
          ? String(raw.signer_layout_json)
          : null,
    signerLayout: parseContractSignerLayout(raw.signerLayout ?? raw.signer_layout_json ?? raw.signerLayoutJson),
    createdAt: raw.createdAt != null ? String(raw.createdAt) : raw.$createdAt != null ? String(raw.$createdAt) : null,
    updatedAt: raw.updatedAt != null ? String(raw.updatedAt) : raw.$updatedAt != null ? String(raw.$updatedAt) : null,
  };
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

export async function fetchContractTemplates(opts: {
  activeOnly?: boolean;
  purpose?: ContractTemplatePurpose;
} = {}): Promise<{
  templates: ContractTemplateItem[];
  configured: boolean;
}> {
  const qs = new URLSearchParams();
  if (opts.activeOnly) qs.set('activeOnly', 'true');
  if (opts.purpose) qs.set('purpose', opts.purpose);
  const res = await templatesFetch(`/api/contract-templates?${qs.toString()}`);
  const data = (await res.json()) as ContractTemplatesListResponse & {
    templates?: Record<string, unknown>[];
    template?: Record<string, unknown>;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  const templates = (data.templates || []).map((t) => mapTemplate(t as Record<string, unknown>));
  return {
    templates,
    configured: data.configured !== false,
  };
}

export async function createContractTemplateRequest(input: {
  name: string;
  description?: string;
  purpose?: ContractTemplatePurpose;
  isDefault?: boolean;
  bodyHtml: string;
  signerLayoutJson?: string;
}): Promise<ContractTemplateItem> {
  const res = await templatesFetch('/api/contract-templates', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      description: input.description,
      purpose: input.purpose || 'enrollment',
      is_default: input.isDefault,
      body_html: input.bodyHtml,
      signer_layout_json: input.signerLayoutJson,
    }),
  });
  const data = (await res.json()) as ContractTemplatesListResponse & { template?: Record<string, unknown> };
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return mapTemplate(data.template as Record<string, unknown>);
}

export async function updateContractTemplateRequest(
  id: string,
  patch: {
    name?: string;
    description?: string;
    purpose?: ContractTemplatePurpose;
    isDefault?: boolean;
    active?: boolean;
    bodyHtml?: string;
    signerLayoutJson?: string;
  }
): Promise<ContractTemplateItem> {
  const res = await templatesFetch(`/api/contract-templates?id=${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: patch.name,
      description: patch.description,
      purpose: patch.purpose,
      is_default: patch.isDefault,
      active: patch.active,
      body_html: patch.bodyHtml,
      signer_layout_json: patch.signerLayoutJson,
    }),
  });
  const data = (await res.json()) as ContractTemplatesListResponse & { template?: Record<string, unknown> };
  if (!res.ok || !data.ok || !data.template) {
    throw new Error(data.error || `Erro HTTP ${res.status}`);
  }
  return mapTemplate(data.template as Record<string, unknown>);
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
  financePlans: Array<{
    name?: string;
    contractTemplateId?: string;
    rescissionTemplateId?: string;
  }> = [],
  purpose: ContractTemplatePurpose = 'enrollment'
): string | null {
  const field = purpose === 'rescission' ? 'rescissionTemplateId' : 'contractTemplateId';
  const scoped = templates.filter(
    (t) => t.active && normalizeTemplatePurpose(t.purpose) === purpose
  );

  const plan = String(planName || '').trim();
  if (!plan) {
    const def = scoped.find((t) => t.isDefault);
    return def?.$id || null;
  }

  const fin = financePlans.find((p) => String(p.name || '').trim() === plan);
  const fromPlan = String(fin?.[field] || '').trim();
  if (fromPlan && scoped.some((t) => t.$id === fromPlan)) return fromPlan;

  const def = scoped.find((t) => t.isDefault);
  return def?.$id || null;
}
