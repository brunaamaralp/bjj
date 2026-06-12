import { ID } from 'node-appwrite';
import { normalizeEnrollmentPhone } from '../../src/lib/publicEnrollmentSettings.js';
import { buildCanonicalLeadPayload } from '../../src/lib/leadDocumentFields.js';
import { normalizeLeadProfileType } from '../leadTypeNormalize.js';
import { namesMatchForDedup } from '../../src/lib/studentPhoneDedup.js';
import {
  findLeadByPhone,
  findRegisteredStudentByPhone,
} from './ensureWhatsAppInboundLead.js';
import {
  buildAcademyDocumentPermissions,
  AcademyPermissionError,
} from './academyDocumentPermissions.js';
import { addLeadEventServer } from './leadEvents.js';
import { DB_ID, LEADS_COL } from './appwriteCollections.js';

const CREATE_LEAD_TYPES = new Set(['Adulto', 'Criança', 'Juniores']);

/**
 * @param {import('node-appwrite').Databases} databases
 * @param {object} params
 */
export async function createLeadServer(databases, { academyId, academyDoc, phone, name, type, origin }) {
  const aid = String(academyId || '').trim();
  const telefone = normalizeEnrollmentPhone(phone) || String(phone || '').replace(/\D/g, '');
  const displayName = String(name || '').trim();
  if (!aid || !telefone || telefone.length < 10) {
    return { ok: false, error: 'invalid_phone' };
  }
  if (!displayName || displayName.length < 2) {
    return { ok: false, error: 'invalid_name' };
  }
  if (!LEADS_COL || !DB_ID) {
    return { ok: false, error: 'leads_not_configured' };
  }

  const existingLead = await findLeadByPhone(databases, telefone, aid);
  if (existingLead?.$id && namesMatchForDedup(existingLead.name, displayName)) {
    return { ok: false, error: 'lead_already_exists', entityIds: { lead_id: existingLead.$id } };
  }

  const existingStudent = await findRegisteredStudentByPhone(databases, aid, telefone);
  if (existingStudent?.$id && namesMatchForDedup(existingStudent.name, displayName)) {
    return { ok: false, error: 'student_already_exists', entityIds: { student_id: existingStudent.$id } };
  }

  const typ = normalizeLeadProfileType(String(type || '').trim());
  const typeFinal = CREATE_LEAD_TYPES.has(typ) ? typ : 'Adulto';

  let perms;
  try {
    perms = buildAcademyDocumentPermissions(academyDoc);
  } catch (e) {
    if (e instanceof AcademyPermissionError) {
      return { ok: false, error: 'academy_permissions' };
    }
    throw e;
  }

  const data = buildCanonicalLeadPayload({
    academyId: aid,
    phone: telefone,
    name: displayName,
    origin: String(origin || 'WhatsApp').trim().slice(0, 128),
    extra: {
      type: typeFinal,
      contact_type: 'lead',
      inbound_auto: true,
      created_by: 'ai-agent',
    },
  });

  try {
    const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), data, perms);
    if (created?.$id) {
      await addLeadEventServer({
        academyId: aid,
        leadId: created.$id,
        type: 'lead_criado',
        text: 'Criado automaticamente pela IA via WhatsApp',
        createdBy: 'ai-agent',
      });
    }
    return {
      ok: true,
      summary: `Lead ${displayName} cadastrado`,
      entityIds: { lead_id: created?.$id },
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 200) };
  }
}
