import { signContract } from '../signContract.js';
import { getContractById, listContracts, isContractStoreConfigured } from './contractService.js';
import { ContractFormError, parseContractFormData } from './parseContractForm.js';
import { resolveContractPdfBuffer } from './resolveContractPdf.js';

export interface HttpErrorBody {
  ok: false;
  error: string;
  detail?: string;
}

export interface ContractAuthContext {
  academyId: string;
  userId: string;
  isOwner: boolean;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function contractBelongsToAcademy(
  contract: { academyId: string | null },
  academyId: string
): boolean {
  if (!contract.academyId) return false;
  return String(contract.academyId) === String(academyId);
}

export async function handlePostContract(
  formData: FormData,
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  try {
    const parsed = await parseContractFormData(formData);
    const sandbox = auth.isOwner ? parsed.sandbox : false;

    const { buffer, templateId } = await resolveContractPdfBuffer({
      academyId: auth.academyId,
      templateId: parsed.template_id,
      leadId: parsed.lead_id,
    });

    const result = await signContract(
      {
        name: parsed.name,
        signers: parsed.signers,
        sandbox,
        academy_id: auth.academyId,
        lead_id: parsed.lead_id,
        template_id: templateId,
      },
      buffer
    );

    if (!result.contract) {
      return jsonResponse(
        {
          ok: false,
          error: 'appwrite_save_failed',
          autentiqueDocument: result.autentiqueDocument,
          detail: result.appwriteError,
        },
        500
      );
    }

    return jsonResponse({
      ok: true,
      contract: result.contract,
      signers: result.signers,
      autentiqueDocument: result.autentiqueDocument,
    });
  } catch (err) {
    if (err instanceof ContractFormError) {
      return jsonResponse({ ok: false, error: err.message }, err.statusCode);
    }

    const message = err instanceof Error ? err.message : String(err);
    const status =
      message === 'autentique_not_configured' || message === 'signers_required' ? 400 : 500;

    console.error('[contracts POST]', err);
    return jsonResponse({ ok: false, error: message }, status);
  }
}

export async function handleGetContracts(
  searchParams: URLSearchParams,
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  try {
    const statusRaw = searchParams.get('status') || undefined;
    const display_status =
      statusRaw && statusRaw !== 'all' ? String(statusRaw).trim() : undefined;
    const leadId =
      searchParams.get('leadId') || searchParams.get('lead_id') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

    const result = await listContracts({
      academy_id: auth.academyId,
      lead_id: leadId ? String(leadId).trim() : undefined,
      display_status,
      page,
      limit,
    });

    return jsonResponse({
      ok: true,
      ...result,
    });
  } catch (err) {
    console.error('[contracts GET]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handleGetContractById(
  id: string,
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  const contractId = String(id || '').trim();
  if (!contractId) {
    return jsonResponse({ ok: false, error: 'id_required' }, 400);
  }

  try {
    const contract = await getContractById(contractId);
    if (!contract) {
      return jsonResponse({ ok: false, error: 'contract_not_found' }, 404);
    }
    if (!contractBelongsToAcademy(contract, auth.academyId)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    return jsonResponse({ ok: true, contract });
  } catch (err) {
    console.error('[contracts GET id]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
