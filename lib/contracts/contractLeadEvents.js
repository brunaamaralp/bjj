import { addLeadEventServer } from '../server/leadEvents.js';

const TYPED_EVENTS = new Set([
  'contract_signed',
  'contract_viewed',
  'contract_expired',
  'signed_after_offboarding',
]);

export function mapAutentiqueToLeadEventType(eventType, metaStatus) {
  const ev = String(eventType || '').trim();
  if (metaStatus === 'signed_after_offboarding' && ev === 'signature.accepted') {
    return 'signed_after_offboarding';
  }
  if (ev === 'signature.accepted') return 'contract_signed';
  if (ev === 'signature.viewed') return 'contract_viewed';
  if (ev === 'document.deleted') return 'contract_expired';
  return null;
}

export async function recordContractLeadEvent({
  academyId,
  leadId,
  contractId,
  type,
  actor = '',
  payload = {},
}) {
  const t = String(type || '').trim();
  if (!TYPED_EVENTS.has(t)) return null;
  const aid = String(academyId || '').trim();
  const lid = String(leadId || '').trim();
  if (!aid || !lid) return null;

  return addLeadEventServer({
    academyId: aid,
    leadId: lid,
    type: t,
    text: t,
    createdBy: String(actor || 'autentique').slice(0, 50),
    payloadJson: {
      contract_id: String(contractId || ''),
      leadId: lid,
      sentAt: new Date().toISOString(),
      ...payload,
    },
  });
}
