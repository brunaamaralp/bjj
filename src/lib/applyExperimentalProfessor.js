import {
  buildExperimentalProfessorEvent,
  buildExperimentalProfessorPatch,
  experimentalProfessorChanged,
} from '../../lib/experimentalProfessor.js';
import { addLeadEvent } from './leadEvents.js';

/**
 * Aplica seleção de professor no lead + evento de auditoria.
 * @param {{
 *   lead: object,
 *   selection: { userId?: string, name?: string } | undefined,
 *   academyId: string,
 *   userId?: string,
 *   permissionContext?: object,
 *   updateLead: (id: string, patch: object, opts?: object) => Promise<unknown>,
 * }} args
 * @returns {Promise<object>} patch aplicado (pode ser {})
 */
export async function applyExperimentalProfessorSelection({
  lead,
  selection,
  academyId,
  userId = '',
  permissionContext = {},
  updateLead,
}) {
  if (selection === undefined) return {};
  const patch = buildExperimentalProfessorPatch(selection);
  if (!experimentalProfessorChanged(lead, selection)) {
    return patch;
  }
  const ev = buildExperimentalProfessorEvent({
    prevLead: lead,
    nextSelection: selection,
    actorUserId: userId,
  });
  try {
    await addLeadEvent({
      academyId,
      leadId: lead.id,
      type: ev.type,
      text: ev.text,
      createdBy: userId || 'user',
      payloadJson: ev.payloadJson,
      permissionContext,
    });
  } catch {
    /* auditoria best-effort */
  }
  await updateLead(lead.id, patch, { fallbackLead: lead });
  return patch;
}
