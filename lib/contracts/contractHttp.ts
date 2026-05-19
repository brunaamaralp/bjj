import { signContract } from '../signContract.js';
import { getContractById, listContracts, isContractStoreConfigured } from './contractService.js';
import { ContractFormError, parseContractFormData } from './parseContractForm.js';

export interface HttpErrorBody {
  ok: false;
  error: string;
  detail?: string;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function handlePostContract(formData: FormData): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  try {
    const parsed = await parseContractFormData(formData);
    const result = await signContract(
      {
        name: parsed.name,
        signers: parsed.signers,
        sandbox: parsed.sandbox,
      },
      parsed.file
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

export async function handleGetContracts(searchParams: URLSearchParams): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  try {
    const status = searchParams.get('status') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 20;

    const result = await listContracts({ status, page, limit });

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

export async function handleGetContractById(id: string): Promise<Response> {
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

    return jsonResponse({ ok: true, contract });
  } catch (err) {
    console.error('[contracts GET id]', err);
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
