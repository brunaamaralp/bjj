import type { ContractAuthContext } from './contractHttp.js';
import { jsonResponse } from './contractHttp.js';
import {
  createContractTemplate,
  deleteContractTemplate,
  getContractTemplateById,
  isContractTemplatesConfigured,
  listContractTemplates,
  replaceContractTemplateFile,
  updateContractTemplate,
} from './contractTemplateService.js';
import { MAX_CONTRACT_PDF_BYTES, ContractFormError } from './parseContractForm.js';

function parsePlanNamesField(raw: FormDataEntryValue | null | string[] | undefined): string[] {
  if (raw == null) return [];
  const s = Array.isArray(raw) ? raw.join(',') : String(raw);
  const trimmed = s.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.map((x) => String(x).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return trimmed
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseBoolField(raw: FormDataEntryValue | null | unknown): boolean {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

async function fileEntryToBuffer(entry: FormDataEntryValue | null): Promise<Buffer> {
  if (!entry || typeof entry === 'string') {
    throw new ContractFormError('file (PDF) é obrigatório');
  }
  const arrayBuffer = await (entry as File | Blob).arrayBuffer();
  const buf = Buffer.from(arrayBuffer);
  if (!buf.length) throw new ContractFormError('file está vazio');
  if (buf.length > MAX_CONTRACT_PDF_BYTES) {
    throw new ContractFormError('PDF muito grande. Tamanho máximo: 10 MB.');
  }
  return buf;
}

function requireOwner(auth: ContractAuthContext): Response | null {
  if (!auth.isOwner) {
    return jsonResponse({ ok: false, error: 'owner_required' }, 403);
  }
  return null;
}

export async function handleGetContractTemplates(
  auth: ContractAuthContext,
  searchParams: URLSearchParams
): Promise<Response> {
  if (!isContractTemplatesConfigured()) {
    return jsonResponse({ ok: true, templates: [], configured: false });
  }

  try {
    const id = searchParams.get('id')?.trim();
    const activeOnly = searchParams.get('activeOnly') === 'true' || searchParams.get('active') === 'true';

    if (id) {
      const template = await getContractTemplateById(id, auth.academyId);
      if (!template) return jsonResponse({ ok: false, error: 'not_found' }, 404);
      return jsonResponse({ ok: true, template, configured: true });
    }

    const templates = await listContractTemplates(auth.academyId, { activeOnly });
    return jsonResponse({ ok: true, templates, configured: true });
  } catch (err) {
    console.error('[contract-templates GET]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handlePostContractTemplate(
  formData: FormData,
  auth: ContractAuthContext
): Promise<Response> {
  const denied = requireOwner(auth);
  if (denied) return denied;

  if (!isContractTemplatesConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_templates_not_configured' }, 503);
  }

  try {
    const name = String(formData.get('name') || '').trim();
    if (!name) return jsonResponse({ ok: false, error: 'name_required' }, 400);

    const description = String(formData.get('description') || '').trim();
    const plan_names = parsePlanNamesField(formData.get('plan_names'));
    const is_default = parseBoolField(formData.get('is_default'));
    const file = await fileEntryToBuffer(formData.get('file'));
    const filename =
      formData.get('filename') != null
        ? String(formData.get('filename'))
        : 'template.pdf';

    const template = await createContractTemplate({
      academy_id: auth.academyId,
      name,
      description: description || undefined,
      plan_names,
      is_default,
      file,
      filename,
    });

    return jsonResponse({ ok: true, template });
  } catch (err) {
    if (err instanceof ContractFormError) {
      return jsonResponse({ ok: false, error: err.message }, err.statusCode);
    }
    console.error('[contract-templates POST]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handlePatchContractTemplate(
  id: string,
  body: Record<string, unknown>,
  auth: ContractAuthContext,
  formData?: FormData | null
): Promise<Response> {
  const denied = requireOwner(auth);
  if (denied) return denied;

  if (!isContractTemplatesConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_templates_not_configured' }, 503);
  }

  try {
    const patch: {
      name?: string;
      description?: string;
      plan_names?: string[];
      is_default?: boolean;
      active?: boolean;
    } = {};

    if (body.name !== undefined) patch.name = String(body.name);
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.plan_names !== undefined) {
      patch.plan_names = Array.isArray(body.plan_names)
        ? body.plan_names.map((x) => String(x).trim()).filter(Boolean)
        : parsePlanNamesField(String(body.plan_names));
    }
    if (body.is_default !== undefined) patch.is_default = parseBoolField(body.is_default as FormDataEntryValue);
    if (body.active !== undefined) patch.active = parseBoolField(body.active as FormDataEntryValue);

    let template = await updateContractTemplate(id, auth.academyId, patch);

    if (formData?.get('file')) {
      const file = await fileEntryToBuffer(formData.get('file'));
      const filename =
        formData.get('filename') != null ? String(formData.get('filename')) : 'template.pdf';
      template = await replaceContractTemplateFile(id, auth.academyId, file, filename);
    }

    if (!template) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    return jsonResponse({ ok: true, template });
  } catch (err) {
    if (err instanceof ContractFormError) {
      return jsonResponse({ ok: false, error: err.message }, err.statusCode);
    }
    console.error('[contract-templates PATCH]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handleDeleteContractTemplate(
  id: string,
  auth: ContractAuthContext
): Promise<Response> {
  const denied = requireOwner(auth);
  if (denied) return denied;

  if (!isContractTemplatesConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_templates_not_configured' }, 503);
  }

  try {
    const deleted = await deleteContractTemplate(id, auth.academyId);
    if (!deleted) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    return jsonResponse({ ok: true });
  } catch (err) {
    console.error('[contract-templates DELETE]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
