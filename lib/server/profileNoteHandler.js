import { Client, Databases } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { addLeadEventServer } from './leadEvents.js';
import { DB_ID, LEADS_COL, STUDENTS_COL, ENDPOINT, PROJECT_ID, API_KEY } from './appwriteCollections.js';
import {
  PROFILE_NOTE_TEXT_MAX,
  buildProfileNoteActionUrl,
  createProfileNoteNotification,
} from './profileNoteNotify.js';
import { apiErro } from './friendlyError.js';

const adminClient =
  PROJECT_ID && API_KEY ? new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY) : null;
const databases = adminClient ? new Databases(adminClient) : null;

/**
 * Resolve aluno (students) ou lead na academia atual.
 * @returns {Promise<{ kind: 'student'|'lead', id: string, name: string, phone: string }|null>}
 */
async function resolvePersonInAcademy(personId, academyId) {
  const id = String(personId || '').trim();
  const aid = String(academyId || '').trim();
  if (!databases || !DB_ID || !id || !aid) return null;

  if (STUDENTS_COL) {
    try {
      const doc = await databases.getDocument(DB_ID, STUDENTS_COL, id);
      if (String(doc.academy_id || '').trim() === aid) {
        return {
          kind: 'student',
          id: doc.$id,
          name: String(doc.name || '').trim() || 'Aluno',
          phone: String(doc.phone || doc.phone_number || '').trim(),
        };
      }
    } catch {
      /* try leads */
    }
  }

  if (LEADS_COL) {
    try {
      const doc = await databases.getDocument(DB_ID, LEADS_COL, id);
      if (String(doc.academy_id || '').trim() === aid) {
        return {
          kind: 'lead',
          id: doc.$id,
          name: String(doc.name || '').trim() || 'Lead',
          phone: String(doc.phone || doc.phone_number || '').trim(),
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * POST /api/leads?route=profile-note
 * Body: { lead_id|person_id, text|note, notify_team?: boolean }
 */
export default async function profileNoteHandler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ sucesso: false, erro: 'method_not_allowed' });
  }

  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const personId = String(body.lead_id || body.person_id || body.student_id || '').trim();
  const text = String(body.text || body.note || '').trim().slice(0, PROFILE_NOTE_TEXT_MAX);
  const notifyTeam = body.notify_team === true || body.notifyTeam === true;

  if (!personId) {
    return res.status(400).json({ sucesso: false, erro: 'lead_id_obrigatorio' });
  }
  if (!text) {
    return res.status(400).json({ sucesso: false, erro: 'texto_obrigatorio' });
  }

  try {
    const person = await resolvePersonInAcademy(personId, academyId);
    if (!person) {
      return res.status(404).json({ sucesso: false, erro: 'pessoa_nao_encontrada' });
    }

    const userId = String(me.$id || '').trim();
    const authorName = String(me.name || me.email || 'Equipe').trim() || 'Equipe';
    const at = new Date().toISOString();

    const eventDoc = await addLeadEventServer({
      academyId,
      leadId: person.id,
      type: 'note',
      text,
      at,
      createdBy: userId || 'user',
      payloadJson: notifyTeam ? { notify_team: true } : null,
    });

    if (!eventDoc?.$id) {
      return res.status(500).json({ sucesso: false, erro: 'falha_ao_gravar_nota' });
    }

    let notificationId = null;
    if (notifyTeam) {
      const created = await createProfileNoteNotification(databases, {
        academyId,
        noteId: eventDoc.$id,
        leadId: person.id,
        leadName: person.name,
        body: text,
        createdByUserId: userId,
        createdByName: authorName,
        actionUrl: buildProfileNoteActionUrl({ personKind: person.kind, personId: person.id }),
        phoneNumber: person.phone,
      });
      if (created.ok) notificationId = created.id;
      // Nota já gravada — falha de notificação não reverte o evento
    }

    return res.status(201).json({
      sucesso: true,
      event: eventDoc,
      event_id: eventDoc.$id,
      notification_id: notificationId,
      notify_team: notifyTeam,
      person_kind: person.kind,
    });
  } catch (e) {
    console.error('[profile-note]', e?.message || e);
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'save') });
  }
}
