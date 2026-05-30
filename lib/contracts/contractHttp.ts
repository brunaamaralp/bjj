import { signContract } from '../signContract.js';
import { deleteDocument } from '../autentique/autentiqueService.js';
import {
  getContractById,
  listContracts,
  isContractStoreConfigured,
  cancelContractById,
} from './contractService.js';
import {
  ContractFormError,
  parseContractFormData,
} from './parseContractForm.js';
import { validateContractSigners } from './validateContractSigners.js';
import { validateSignersForAutentique } from './validateSignersForAutentique.js';
import { formatAutentiqueValidationDetail } from '../autentique/parseAutentiqueErrors.js';
import {
  autentiqueValidationFallbackHints,
  diagnoseContractSend,
} from './contractSendDiagnostics.js';
import { resolveContractPdfBuffer } from './resolveContractPdf.js';
import { applyLayoutToSigners, countEnabledSignerSlots } from './contractSignerLayout.js';
import { syncContractFromAutentique } from './contractAutentiqueSync.js';
import { fetchLeadPersonForContract, fetchAcademyDoc } from './contractLeadAccess.js';
import {
  buildAutentiqueDocumentName,
  buildAutentiqueSignerMessage,
} from './buildAutentiqueDocumentMeta.js';
import {
  resolveSignatureDeadlineDays,
  computeContractExpiresAt,
} from './contractSignaturePolicy.js';
import { logContractStructured } from './contractStructuredLog.js';
import { enrichContractSignersFromAcademy } from './enrichContractSigners.js';
import {
  humanizeAutentiqueError,
  isAutentiqueClientError,
} from '../autentique/humanizeAutentiqueError.js';

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

async function resolveExpiresAt(academyId: string): Promise<string | null> {
  const academy = await fetchAcademyDoc(academyId);
  const days = resolveSignatureDeadlineDays(academy);
  return computeContractExpiresAt(new Date().toISOString(), days);
}

export async function handlePreviewContract(
  formData: FormData,
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  try {
    const parsed = await parseContractFormData(formData, { skipSignerValidation: true });
    const { buffer } = await resolveContractPdfBuffer({
      academyId: auth.academyId,
      templateId: parsed.template_id,
      leadId: parsed.lead_id,
    });

    logContractStructured('contract_preview', {
      academy_id: auth.academyId,
      student_id: parsed.lead_id,
      status: 'preview',
    });

    return jsonResponse({
      ok: true,
      pdfBase64: buffer.toString('base64'),
      contentType: 'application/pdf',
    });
  } catch (err) {
    if (err instanceof ContractFormError) {
      return jsonResponse({ ok: false, error: err.message }, err.statusCode);
    }
    const message = err instanceof Error ? err.message : String(err);
    logContractStructured('contract_preview_fail', {
      academy_id: auth.academyId,
      error: message,
    });
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handlePostContract(
  formData: FormData,
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  let signersForHints: import('./types.js').SignerInput[] = [];

  try {
    const parsed = await parseContractFormData(formData, { skipSignerValidation: true });
    const sandbox = auth.isOwner ? parsed.sandbox : false;

    const isRescission = parsed.contract_purpose === 'rescission';

    if (parsed.lead_id && !isRescission) {
      const person = await fetchLeadPersonForContract(parsed.lead_id);
      if (person?.inactive) {
        logContractStructured('contract_create_blocked', {
          academy_id: auth.academyId,
          student_id: parsed.lead_id,
          status: 'student_inactive',
        });
        return jsonResponse(
          {
            ok: false,
            error: 'Não é possível enviar contrato para aluno desligado ou inativo.',
            code: 'student_inactive',
          },
          403
        );
      }
    }

    const expiresAt = await resolveExpiresAt(auth.academyId);

    const { buffer, pageCount, template } = await resolveContractPdfBuffer({
      academyId: auth.academyId,
      templateId: parsed.template_id,
      leadId: parsed.lead_id,
    });

    if (isRescission && template.purpose !== 'rescission') {
      throw new ContractFormError(
        'Selecione um modelo de termo de rescisão (finalidade Rescisão em Empresa → Contratos).'
      );
    }

    const requiredSigners = countEnabledSignerSlots(template.signerLayout);
    if (requiredSigners > 0 && parsed.signers.length !== requiredSigners) {
      throw new ContractFormError(
        `Este modelo exige ${requiredSigners} signatário(s). Você informou ${parsed.signers.length}.`
      );
    }

    const signersEnriched = await enrichContractSignersFromAcademy(
      parsed.signers,
      template.signerLayout,
      auth.academyId
    );
    signersForHints = signersEnriched;
    validateContractSigners(signersEnriched);
    validateSignersForAutentique(signersEnriched);

    const preflight = diagnoseContractSend({
      signers: signersEnriched,
      layout: template.signerLayout,
      pageCount,
      pdfByteLength: buffer.length,
    });
    if (preflight.blockers.length) {
      throw new ContractFormError(preflight.blockers.join('\n'));
    }

    const signersWithPositions = applyLayoutToSigners(
      signersEnriched,
      template.signerLayout,
      pageCount
    );

    const academyDoc = await fetchAcademyDoc(auth.academyId);
    const academyName = String(academyDoc?.name || academyDoc?.academy_name || '').trim();
    const autentiqueDocumentName = buildAutentiqueDocumentName({
      academyName,
      baseName: parsed.name,
    });
    const autentiqueMessage = buildAutentiqueSignerMessage({
      academyName,
      purpose: parsed.contract_purpose,
    });

    const result = await signContract(
      {
        name: autentiqueDocumentName,
        message: autentiqueMessage,
        signers: signersWithPositions,
        sandbox,
        academy_id: auth.academyId,
        lead_id: parsed.lead_id,
        template_id: template.$id,
        expires_at: expiresAt || undefined,
      },
      buffer
    );

    if (!result.contract) {
      logContractStructured('contract_create_fail', {
        academy_id: auth.academyId,
        student_id: parsed.lead_id,
        status: 'appwrite_save_failed',
        error: result.appwriteError,
      });
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

    logContractStructured('contract_created', {
      academy_id: auth.academyId,
      contract_id: result.contract.$id,
      student_id: parsed.lead_id,
      status: result.contract.status,
    });

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
    const autentiquePayload =
      err && typeof err === 'object' && 'autentique' in err
        ? (err as { autentique?: { errors?: unknown[] } }).autentique
        : null;
    const autentiqueErrors = Array.isArray(autentiquePayload?.errors)
      ? autentiquePayload.errors
      : [];
    const autentiqueCode =
      err && typeof err === 'object' && 'autentiqueCode' in err
        ? String((err as { autentiqueCode?: string }).autentiqueCode || '')
        : '';
    const validationDetail = formatAutentiqueValidationDetail(
      autentiqueErrors as Parameters<typeof formatAutentiqueValidationDetail>[0]
    );
    const friendly = humanizeAutentiqueError(autentiqueCode || message, autentiqueErrors as never);
    const status = isAutentiqueClientError(autentiqueCode || message) ? 400 : 500;

    logContractStructured('contract_create_fail', {
      academy_id: auth.academyId,
      error: message,
      autentique_validation: validationDetail || null,
      status: 'error',
    });
    const hints =
      validationDetail.length > 0 ? [] : autentiqueValidationFallbackHints(signersForHints);

    return jsonResponse(
      {
        ok: false,
        error: friendly,
        detail: validationDetail || undefined,
        hints: hints.length ? hints : undefined,
      },
      status
    );
  }
}

export async function handlePatchContract(
  id: string,
  body: { action?: string },
  auth: ContractAuthContext
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  const contractId = String(id || '').trim();
  if (!contractId) return jsonResponse({ ok: false, error: 'id_required' }, 400);

  const action = String(body?.action || '').trim();
  if (action !== 'cancel') {
    return jsonResponse({ ok: false, error: 'invalid_action' }, 400);
  }

  try {
    const existing = await getContractById(contractId);
    if (!existing) return jsonResponse({ ok: false, error: 'contract_not_found' }, 404);
    if (!contractBelongsToAcademy(existing, auth.academyId)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    if (existing.autentiqueId) {
      await deleteDocument(String(existing.autentiqueId));
    }

    const updated = await cancelContractById(contractId);
    logContractStructured('contract_cancelled', {
      academy_id: auth.academyId,
      contract_id: contractId,
      student_id: existing.leadId,
      status: 'cancelled',
    });

    return jsonResponse({ ok: true, contract: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
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
    logContractStructured('contract_list_fail', {
      academy_id: auth.academyId,
      error: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}

export async function handleGetContractById(
  id: string,
  auth: ContractAuthContext,
  searchParams?: URLSearchParams
): Promise<Response> {
  if (!isContractStoreConfigured()) {
    return jsonResponse({ ok: false, error: 'contract_store_not_configured' }, 500);
  }

  const contractId = String(id || '').trim();
  if (!contractId) {
    return jsonResponse({ ok: false, error: 'id_required' }, 400);
  }

  try {
    const shouldSync =
      searchParams?.get('sync') === '1' || searchParams?.get('sync') === 'true';
    if (shouldSync) {
      const syncResult = await syncContractFromAutentique(contractId, auth.academyId);
      if (!syncResult.ok) {
        return jsonResponse({ ok: false, error: syncResult.error }, syncResult.error === 'forbidden' ? 403 : 404);
      }
    }

    const contract = await getContractById(contractId);
    if (!contract) {
      return jsonResponse({ ok: false, error: 'contract_not_found' }, 404);
    }
    if (!contractBelongsToAcademy(contract, auth.academyId)) {
      return jsonResponse({ ok: false, error: 'forbidden' }, 403);
    }

    return jsonResponse({ ok: true, contract, synced: shouldSync });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ ok: false, error: message }, 500);
  }
}
