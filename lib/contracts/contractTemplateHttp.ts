import type { ContractAuthContext } from './contractHttp.js';
import { jsonResponse } from './contractHttp.js';
import {
  createContractTemplate,
  deleteContractTemplate,
  getContractTemplateById,
  isContractTemplatesConfigured,
  listContractTemplates,
  parseContractTemplatePurpose,
  updateContractTemplate,
  type ContractTemplatePurpose,
} from './contractTemplateService.js';

function parseBoolField(raw: unknown): boolean {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
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
    const purposeRaw = searchParams.get('purpose')?.trim();
    const purpose = purposeRaw
      ? (parseContractTemplatePurpose(purposeRaw) as ContractTemplatePurpose)
      : undefined;

    if (id) {
      const template = await getContractTemplateById(id, auth.academyId);
      if (!template) return jsonResponse({ ok: false, error: 'not_found' }, 404);
      return jsonResponse({ ok: true, template, configured: true });
    }

    const templates = await listContractTemplates(auth.academyId, { activeOnly, purpose });
    return jsonResponse({ ok: true, templates, configured: true });
  } catch (err) {
    console.error('[contract-templates GET]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handlePostContractTemplate(
  body: Record<string, unknown>,
  auth: ContractAuthContext
): Promise<Response> {
  const denied = requireOwner(auth);
  if (denied) return denied;

  if (!isContractTemplatesConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_templates_not_configured' }, 503);
  }

  try {
    const name = String(body.name || '').trim();
    if (!name) return jsonResponse({ ok: false, error: 'name_required' }, 400);

    const body_html = String(body.body_html || body.bodyHtml || '').trim();
    if (!body_html) return jsonResponse({ ok: false, error: 'body_html_required' }, 400);

    const signerLayoutRaw = body.signer_layout_json ?? body.signerLayoutJson;
    const template = await createContractTemplate({
      academy_id: auth.academyId,
      name,
      description: String(body.description || '').trim() || undefined,
      purpose: parseContractTemplatePurpose(body.purpose),
      is_default: parseBoolField(body.is_default ?? body.isDefault),
      body_html,
      signer_layout_json:
        signerLayoutRaw != null && String(signerLayoutRaw).trim()
          ? String(signerLayoutRaw)
          : undefined,
    });

    return jsonResponse({ ok: true, template });
  } catch (err) {
    console.error('[contract-templates POST]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handlePatchContractTemplate(
  id: string,
  body: Record<string, unknown>,
  auth: ContractAuthContext
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
      purpose?: ContractTemplatePurpose;
      is_default?: boolean;
      active?: boolean;
      body_html?: string;
      signer_layout_json?: string;
    } = {};

    if (body.name !== undefined) patch.name = String(body.name);
    if (body.description !== undefined) patch.description = String(body.description);
    if (body.purpose !== undefined) patch.purpose = parseContractTemplatePurpose(body.purpose);
    if (body.is_default !== undefined || body.isDefault !== undefined) {
      patch.is_default = parseBoolField(body.is_default ?? body.isDefault);
    }
    if (body.active !== undefined) patch.active = parseBoolField(body.active);
    if (body.body_html !== undefined || body.bodyHtml !== undefined) {
      patch.body_html = String(body.body_html ?? body.bodyHtml ?? '');
    }
    if (body.signer_layout_json !== undefined || body.signerLayoutJson !== undefined) {
      patch.signer_layout_json = String(body.signer_layout_json ?? body.signerLayoutJson ?? '');
    }

    const template = await updateContractTemplate(id, auth.academyId, patch);
    if (!template) return jsonResponse({ ok: false, error: 'not_found' }, 404);
    return jsonResponse({ ok: true, template });
  } catch (err) {
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
