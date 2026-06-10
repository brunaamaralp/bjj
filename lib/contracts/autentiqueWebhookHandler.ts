import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  isContractStoreConfigured,
  getContractByAutentiqueId,
  updateContractStatus,
  updateSignerStatus,
  saveContractEvent,
  saveWebhookLog,
  updateWebhookLog,
  updateContractMeta,
  hasContractEventByAutentiqueEventId,
} from './contractService.js';
import { fetchLeadPersonForContract } from './contractLeadAccess.js';
import {
  mapAutentiqueToLeadEventType,
  recordContractLeadEvent,
} from './contractLeadEvents.js';
import { logContractStructured } from './contractStructuredLog.js';
import { isPastIso } from './contractSignaturePolicy.js';
import { mapContractDisplayStatus } from './displayStatus.js';
import { syncContractFromAutentique } from './contractAutentiqueSync.js';
import { recomputeContractStatusFromSigners } from './contractService.js';

export function verifyAutentiqueSignature(
  rawBody: string,
  headerSignature: string | string[] | undefined,
  secret: string
): boolean {
  const signature = Array.isArray(headerSignature)
    ? String(headerSignature[0] || '').trim()
    : String(headerSignature || '').trim();
  if (!signature || !secret) return false;

  const calculated = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');

  try {
    const bufA = Buffer.from(calculated, 'hex');
    const bufB = Buffer.from(signature, 'hex');
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

export function mapContractStatusFromEvent(eventType: string): string | null {
  switch (eventType) {
    case 'document.created':
      return 'created';
    case 'document.updated':
      return 'in_progress';
    case 'document.finished':
      return 'finished';
    case 'document.deleted':
      return 'deleted';
    default:
      return null;
  }
}

export function mapSignerStatusFromEvent(eventType: string): string | null {
  switch (eventType) {
    case 'signature.created':
      return 'pending';
    case 'signature.viewed':
      return 'viewed';
    case 'signature.accepted':
      return 'signed';
    case 'signature.rejected':
      return 'rejected';
    case 'signature.deleted':
      return 'removed';
    case 'signature.delivery_failed':
      return 'delivery_failed';
    case 'signature.updated':
      return 'updated';
    case 'signature.biometric_approved':
      return 'biometric_approved';
    case 'signature.biometric_unapproved':
      return 'biometric_unapproved';
    case 'signature.biometric_rejected':
      return 'biometric_rejected';
    case 'signature.biometric_reset':
      return 'biometric_reset';
    default:
      return null;
  }
}

function asDataRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Extrai o ID do documento Autentique do payload do webhook.
 * Formatos suportados (doc oficial):
 * - document.*: event.data.object = { id, object: "document", ... }
 * - signature.*: event.data.document = "<id>"
 * - legado/achatado: event.data.object = "document", event.data.id
 */
export function extractAutentiqueDocumentId(body: { event?: { data?: Record<string, unknown> } }): string | null {
  const data = body?.event?.data;
  if (!data) return null;

  const documentRef = data.document;
  if (documentRef != null && typeof documentRef !== 'object') {
    const id = String(documentRef).trim();
    if (id) return id;
  }

  const nestedObject = asDataRecord(data.object);
  if (nestedObject) {
    const nestedKind = String(nestedObject.object || '').toLowerCase();
    const nestedId = nestedObject.id != null ? String(nestedObject.id).trim() : '';
    if (nestedId && (!nestedKind || nestedKind === 'document')) return nestedId;
  }

  if (data.object === 'document' && data.id) {
    const id = String(data.id).trim();
    if (id) return id;
  }

  return null;
}

export function extractSignerPublicId(body: { event?: { data?: Record<string, unknown> } }): string | null {
  const data = body?.event?.data;
  if (!data) return null;

  if (data.public_id) return String(data.public_id).trim() || null;

  const nestedObject = asDataRecord(data.object);
  if (nestedObject && String(nestedObject.object || '').toLowerCase() === 'signature') {
    const publicId = nestedObject.public_id != null ? String(nestedObject.public_id).trim() : '';
    if (publicId) return publicId;
  }

  if (data.object !== 'signature') return null;
  return data.public_id ? String(data.public_id).trim() || null : null;
}

function signedAtFromPayload(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim();
    return s || null;
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    const created = (value as Record<string, unknown>).created_at;
    if (created != null) {
      const s = String(created).trim();
      return s || null;
    }
  }
  return null;
}

export function extractSignerSignedAt(body: { event?: { data?: Record<string, unknown> } }): string | null {
  const data = body?.event?.data;
  if (!data) return null;

  const direct = signedAtFromPayload(data.signed);
  if (direct) return direct;

  const nestedObject = asDataRecord(data.object);
  if (nestedObject) return signedAtFromPayload(nestedObject.signed);

  return null;
}

function extractSignerActor(body: { event?: { data?: Record<string, unknown> } }): string {
  const data = body?.event?.data;
  if (!data) return '';

  const user = asDataRecord(data.user);
  const nestedObject = asDataRecord(data.object);

  return String(
    data.name ||
      user?.name ||
      nestedObject?.name ||
      data.email ||
      user?.email ||
      nestedObject?.email ||
      data.public_id ||
      nestedObject?.public_id ||
      ''
  ).trim();
}

async function maybeMarkSignedAfterOffboarding(
  contract: { $id: string; academyId: string | null; leadId: string | null },
  eventType: string
): Promise<string | null> {
  if (eventType !== 'signature.accepted') return null;
  const leadId = String(contract.leadId || '').trim();
  if (!leadId) return null;

  const person = await fetchLeadPersonForContract(leadId);
  if (!person?.inactive) return null;

  await updateContractMeta(contract.$id, { meta_status: 'signed_after_offboarding' });
  return 'signed_after_offboarding';
}

export async function processAutentiqueWebhook(
  rawBody: string,
  parsedBody: { event?: { id?: string; type?: string; data?: Record<string, unknown> } },
  opts: { signatureHeader?: string | string[]; skipSignature?: boolean } = {}
) {
  if (!isContractStoreConfigured()) {
    return { ok: false as const, error: 'contract_store_not_configured' };
  }

  const secret = String(process.env.AUTENTIQUE_WEBHOOK_SECRET || '').trim();
  const signatureValid =
    opts.skipSignature === true ||
    Boolean(secret && verifyAutentiqueSignature(rawBody, opts.signatureHeader, secret));

  const eventType = String(parsedBody?.event?.type || '').trim();
  const log = await saveWebhookLog({
    raw_payload: rawBody,
    signature_valid: signatureValid,
    processed: false,
    event_type: eventType,
  });

  if (!signatureValid) {
    await updateWebhookLog(log.$id, { processed: true, error: 'invalid_signature' });
    return { ok: false as const, error: 'invalid_signature', logId: log.$id };
  }

  const autentiqueId = extractAutentiqueDocumentId(parsedBody);
  if (!autentiqueId) {
    await updateWebhookLog(log.$id, { processed: true, error: 'missing_document_id' });
    return { ok: false as const, error: 'missing_document_id', logId: log.$id };
  }

  const contract = await getContractByAutentiqueId(autentiqueId);
  if (!contract) {
    await updateWebhookLog(log.$id, { processed: true, error: 'contract_not_found' });
    return { ok: false as const, error: 'contract_not_found', logId: log.$id, autentiqueId };
  }

  const autentiqueEventId = parsedBody?.event?.id ? String(parsedBody.event.id).trim() : '';
  if (autentiqueEventId) {
    const duplicate = await hasContractEventByAutentiqueEventId(autentiqueEventId);
    if (duplicate) {
      await updateWebhookLog(log.$id, { processed: true, error: 'duplicate_event' });
      return { ok: true as const, duplicate: true, logId: log.$id, autentiqueId };
    }
  }

  try {
    const contractStatus = mapContractStatusFromEvent(eventType);
    if (contractStatus) {
      await updateContractStatus(autentiqueId, contractStatus);
    }

    const signerStatus = mapSignerStatusFromEvent(eventType);
    const publicId = extractSignerPublicId(parsedBody);
    if (signerStatus && publicId) {
      const signedAt = extractSignerSignedAt(parsedBody);
      await updateSignerStatus(publicId, signerStatus, signedAt);
    } else if (
      eventType.startsWith('signature.') &&
      signerStatus &&
      contract.academyId &&
      (eventType === 'signature.accepted' ||
        eventType === 'signature.viewed' ||
        eventType === 'signature.rejected')
    ) {
      await syncContractFromAutentique(contract.$id, contract.academyId);
    }

    if (eventType.startsWith('signature.') && signerStatus && !publicId) {
      console.warn('[autentique webhook] evento de assinatura sem public_id — sync pela API', {
        eventType,
        autentiqueId,
      });
    }

    if (eventType.startsWith('signature.')) {
      await recomputeContractStatusFromSigners(contract.$id);
    }

    const metaStatus = await maybeMarkSignedAfterOffboarding(contract, eventType);

    await saveContractEvent({
      contract_id: contract.$id,
      event_type: eventType,
      autentique_event_id: parsedBody?.event?.id ? String(parsedBody.event.id) : undefined,
      autentique_document_id: autentiqueId,
      payload: parsedBody?.event || parsedBody,
    });

    const leadEventType = mapAutentiqueToLeadEventType(eventType, metaStatus);
    const actor = extractSignerActor(parsedBody);
    if (leadEventType && contract.leadId && contract.academyId) {
      await recordContractLeadEvent({
        academyId: contract.academyId,
        leadId: contract.leadId,
        contractId: contract.$id,
        type: leadEventType,
        actor,
        payload: { autentique_event: eventType, meta_status: metaStatus },
      });
    }

    if (
      contract.expiresAt &&
      isPastIso(contract.expiresAt) &&
      leadEventType !== 'contract_signed' &&
      eventType === 'signature.viewed'
    ) {
      const display = mapContractDisplayStatus(contract.status, 0, 1, {
        expiresAt: contract.expiresAt,
        metaStatus: metaStatus || contract.metaStatus,
      });
      if (display === 'expired' && contract.leadId && contract.academyId) {
        await recordContractLeadEvent({
          academyId: contract.academyId,
          leadId: contract.leadId,
          contractId: contract.$id,
          type: 'contract_expired',
          actor,
          payload: { reason: 'deadline_passed' },
        });
      }
    }

    await updateWebhookLog(log.$id, { processed: true, error: '' });

    const display = mapContractDisplayStatus(
      contractStatus || contract.status,
      0,
      1,
      { expiresAt: contract.expiresAt, metaStatus: metaStatus || contract.metaStatus }
    );

    logContractStructured(`autentique_${eventType.replace(/\./g, '_')}`, {
      event: leadEventType || eventType,
      academy_id: contract.academyId,
      contract_id: contract.$id,
      student_id: contract.leadId,
      status: metaStatus || display || contract.status,
    });

    return {
      ok: true as const,
      logId: log.$id,
      contractId: contract.$id,
      autentiqueId,
      eventType,
      leadEventType,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logContractStructured('autentique_webhook_fail', {
      contract_id: contract.$id,
      academy_id: contract.academyId,
      student_id: contract.leadId,
      error: message,
    });
    await updateWebhookLog(log.$id, { processed: false, error: message });
    throw e;
  }
}
