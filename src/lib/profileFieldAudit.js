import { addLeadEvent } from './leadEvents.js';

export const PROFILE_FIELD_EVENT_TYPE = 'profile_field_updated';

/**
 * Registra alteração de campo na timeline (lead_events).
 * @param {object} opts
 */
export async function logProfileFieldUpdate({
  academyId,
  leadId,
  field,
  fieldLabel,
  from = '',
  to = '',
  actorUserId = 'user',
  permissionContext = {},
}) {
  const label = String(fieldLabel || field || 'Campo').trim();
  const fromStr = String(from ?? '').trim();
  const toStr = String(to ?? '').trim();
  if (fromStr === toStr) return null;

  return addLeadEvent({
    academyId,
    leadId,
    type: PROFILE_FIELD_EVENT_TYPE,
    from: fromStr.slice(0, 128),
    to: toStr.slice(0, 128),
    text: `${label} alterado`,
    createdBy: String(actorUserId || 'user').slice(0, 50),
    payloadJson: {
      field: String(field || '').slice(0, 64),
      field_label: label.slice(0, 128),
    },
    permissionContext,
  });
}
