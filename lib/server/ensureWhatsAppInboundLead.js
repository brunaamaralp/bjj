import { Client, Databases, ID, Permission, Query, Role } from 'node-appwrite';
import { normalizeEnrollmentPhone } from '../../src/lib/publicEnrollmentSettings.js';
import { studentDocMatchesPhone } from '../registeredStudentPhones.js';
import { DB_ID, LEADS_COL, STUDENTS_COL } from './appwriteCollections.js';
import { addLeadEventServer } from './leadEvents.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const CONVERSATIONS_COL =
  process.env.APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  process.env.VITE_APPWRITE_CONVERSATIONS_COLLECTION_ID ||
  '';

const adminClient = PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const defaultDatabases = adminClient ? new Databases(adminClient) : null;

function permissionsForAcademyDoc(academyDoc) {
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const teamId = String(academyDoc?.teamId || '').trim();
  const perms = [];
  if (ownerId) {
    perms.push(
      Permission.read(Role.user(ownerId)),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId))
    );
  }
  if (teamId) {
    perms.push(
      Permission.read(Role.team(teamId)),
      Permission.update(Role.team(teamId)),
      Permission.delete(Role.team(teamId))
    );
  }
  if (perms.length > 0) return perms;
  return [Permission.read(Role.users()), Permission.update(Role.users()), Permission.delete(Role.users())];
}

function phoneQueryVariants(phone) {
  const p = normalizeEnrollmentPhone(phone);
  if (!p) return [];
  const set = new Set([p]);
  if (p.length >= 10) set.add(`55${p}`);
  return [...set];
}

export async function findLeadByPhone(databases, phone, academyId) {
  if (!databases || !LEADS_COL) return null;
  const a = String(academyId || '').trim();
  if (!a) return null;
  const p = normalizeEnrollmentPhone(phone);
  const candidates = [];
  if (p) candidates.push(p);
  const raw = String(phone || '').trim();
  if (raw && raw !== p) candidates.push(raw.replace(/\D/g, ''));

  const queryCombos = [
    { academy: 'academy_id', phone: 'phone_number' },
    { academy: 'academy_id', phone: 'phone' },
    { academy: 'academyId', phone: 'phone' },
    { academy: 'academyId', phone: 'phone_number' },
  ];

  for (const c of candidates) {
    for (const combo of queryCombos) {
      try {
        const list = await databases.listDocuments(DB_ID, LEADS_COL, [
          Query.equal(combo.academy, [a]),
          Query.equal(combo.phone, [c]),
          Query.limit(1),
        ]);
        const doc = list.documents?.[0] || null;
        if (doc) return doc;
      } catch {
        void 0;
      }
    }
  }
  return null;
}

export async function findRegisteredStudentByPhone(databases, academyId, phone) {
  if (!databases || !STUDENTS_COL || !DB_ID) return null;
  const a = String(academyId || '').trim();
  if (!a) return null;

  const academyKeys = ['academyId', 'academy_id'];
  const fieldKeys = ['phone', 'phone_number', 'emergencyPhone', 'emergency_phone'];

  for (const academyKey of academyKeys) {
    for (const fieldKey of fieldKeys) {
      for (const variant of phoneQueryVariants(phone)) {
        try {
          const list = await databases.listDocuments(DB_ID, STUDENTS_COL, [
            Query.equal(academyKey, [a]),
            Query.equal(fieldKey, [variant]),
            Query.limit(8),
          ]);
          for (const doc of list.documents || []) {
            if (studentDocMatchesPhone(doc, phone)) return doc;
          }
        } catch {
          void 0;
        }
      }
    }
  }
  return null;
}

async function linkConversationLeadId(databases, conversationDocId, leadId) {
  const docId = String(conversationDocId || '').trim();
  const lid = String(leadId || '').trim();
  if (!databases || !CONVERSATIONS_COL || !DB_ID || !docId || !lid) return;
  try {
    await databases.updateDocument(DB_ID, CONVERSATIONS_COL, docId, { lead_id: lid });
  } catch {
    void 0;
  }
}

async function createWhatsAppLead({ databases, academyId, phone, name, academyDoc }) {
  const telefone = normalizeEnrollmentPhone(phone) || String(phone || '').replace(/\D/g, '');
  if (!telefone) return null;
  const displayName = String(name || '').trim() || telefone;
  const nowIso = new Date().toISOString();
  const perms = permissionsForAcademyDoc(academyDoc);
  const payloads = [
    {
      name: displayName,
      phone_number: telefone,
      status: 'Novo',
      origin: 'WhatsApp',
      academy_id: academyId,
      contact_type: 'lead',
      pipeline_stage: 'Novo',
      triage_status: 'pending',
      inbound_auto: true,
      status_changed_at: nowIso,
      pipeline_stage_changed_at: nowIso,
    },
    {
      name: displayName,
      phone: telefone,
      status: 'Novo',
      origin: 'WhatsApp',
      academyId,
      contact_type: 'lead',
      pipeline_stage: 'Novo',
      triage_status: 'pending',
      inbound_auto: true,
      status_changed_at: nowIso,
      pipeline_stage_changed_at: nowIso,
    },
  ];

  for (const data of payloads) {
    try {
      const created = await databases.createDocument(DB_ID, LEADS_COL, ID.unique(), data, perms);
      if (created?.$id) {
        await addLeadEventServer({
          academyId,
          leadId: created.$id,
          type: 'lead_criado',
          text: 'Criado automaticamente via WhatsApp',
          at: created.$createdAt || nowIso,
          createdBy: 'system',
        });
      }
      return created || null;
    } catch {
      void 0;
    }
  }
  return null;
}

/**
 * Garante lead no CRM para contato WhatsApp desconhecido (não é telefone de aluno/responsável cadastrado).
 */
export async function ensureWhatsAppInboundLead({
  databases = defaultDatabases,
  academyId,
  phone,
  name = '',
  academyDoc = null,
  conversationDocId = '',
}) {
  if (!databases || !LEADS_COL || !DB_ID) {
    return { leadDoc: null, created: false, skippedReason: 'not_configured' };
  }

  const a = String(academyId || '').trim();
  if (!a) return { leadDoc: null, created: false, skippedReason: 'no_academy' };

  const existingLead = await findLeadByPhone(databases, phone, a);
  if (existingLead) {
    await linkConversationLeadId(databases, conversationDocId, existingLead.$id);
    return { leadDoc: existingLead, created: false, skippedReason: 'existing_lead' };
  }

  const registeredStudent = await findRegisteredStudentByPhone(databases, a, phone);
  if (registeredStudent) {
    return { leadDoc: null, created: false, skippedReason: 'registered_student' };
  }

  const leadDoc = await createWhatsAppLead({ databases, academyId: a, phone, name, academyDoc });
  if (leadDoc?.$id) {
    await linkConversationLeadId(databases, conversationDocId, leadDoc.$id);
    return { leadDoc, created: true, skippedReason: null };
  }

  return { leadDoc: null, created: false, skippedReason: 'create_failed' };
}
