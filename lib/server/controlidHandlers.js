import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from './academyAccess.js';
import { encryptControlIdPassword } from './controlidCrypto.js';
import {
  configWithPlainPassword,
  testConnection,
  syncStudentOnDevice,
  destroyUser,
  releaseGate,
  pollAccessEvents,
  testUserImage,
  buildControlIdUserId,
} from './controlidService.js';
import { mergeControlIdIntoSettings, readControlIdConfig, resolveControlIdUserId } from '../controlidSettings.js';
import { addLeadEventServer } from './leadEvents.js';
import { buildControlIdAttendanceDocument } from '../attendanceDocument.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const LEADS_COL = process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || process.env.APPWRITE_LEADS_COLLECTION_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';
const ATTENDANCE_COL =
  process.env.APPWRITE_ATTENDANCE_COLLECTION_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COL_ID ||
  process.env.VITE_APPWRITE_ATTENDANCE_COLLECTION_ID ||
  '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  res.status(status).json(obj);
}

async function loadAcademy(academyId) {
  return databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
}

async function loadLead(leadId) {
  return databases.getDocument(DB_ID, LEADS_COL, leadId);
}

function patchLeadSyncState(leadId, patch) {
  return databases.updateDocument(DB_ID, LEADS_COL, leadId, patch);
}

async function getConfigForAcademy(academyId) {
  const academy = await loadAcademy(academyId);
  const config = configWithPlainPassword(academy);
  if (!config.configured) {
    const err = new Error('Integração Control iD não configurada ou desativada');
    err.code = 'not_configured';
    throw err;
  }
  return { academy, config };
}

export async function controlidTestHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  try {
    const body = req.body || {};
    const academy = await loadAcademy(academyId);
    const saved = readControlIdConfig(academy.settings);

    const ip = String(body.ip || saved.ip || '').trim();
    const port = Number(body.port ?? saved.port) || 80;
    const username = String(body.username || saved.username || 'admin').trim();
    const plainPassword = String(body.password || '').trim();

    let password = plainPassword;
    if (!password && saved.passwordEncrypted) {
      const cfg = configWithPlainPassword(academy);
      password = cfg.password;
    }
    if (!ip || !password) {
      return json(res, 400, { sucesso: false, erro: 'IP e senha são obrigatórios para testar' });
    }

    const config = { enabled: true, ip, port, username, password, portal_id: saved.portal_id };
    const result = await testConnection(config);
    return json(res, 200, {
      sucesso: true,
      portals: result.portals || [],
      message: 'Conexão com a catraca estabelecida',
    });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: e?.message || 'Falha na conexão' });
  }
}

export async function controlidSaveConfigHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  try {
    const body = req.body || {};
    const academy = await loadAcademy(academyId);
    const prev = readControlIdConfig(academy.settings);

    let passwordEncrypted = prev.passwordEncrypted;
    const newPassword = String(body.password || '').trim();
    if (newPassword) {
      passwordEncrypted = encryptControlIdPassword(newPassword);
    }

    const merged = mergeControlIdIntoSettings(academy.settings, {
      enabled: body.enabled !== false,
      ip: String(body.ip || prev.ip || '').trim(),
      port: Number(body.port ?? prev.port) || 80,
      username: String(body.username || prev.username || 'admin').trim(),
      passwordEncrypted,
      portal_id: Number(body.portal_id ?? prev.portal_id) || 1,
    });

    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      settings: JSON.stringify(merged),
    });

    return json(res, 200, { sucesso: true });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: e?.message || 'Erro ao salvar' });
  }
}

/** Sincroniza aluno na catraca (uso interno: cron de trancamento, etc.). */
export async function controlidSyncLeadServer(academyId, leadId) {
  const lead = await loadLead(leadId);
  const { config } = await getConfigForAcademy(academyId);
  const photoUrl = String(lead.photo_url || lead.photoUrl || '').trim();
  const { userId } = await syncStudentOnDevice(config, { leadDoc: lead, photoUrl });
  await patchLeadSyncState(leadId, {
    controlid_user_id: userId,
    device_id: userId,
    controlid_synced: true,
    controlid_sync_error: null,
  });
  return { userId };
}

export async function controlidSyncHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const leadId = String(req.body?.lead_id || req.body?.leadId || '').trim();
  if (!leadId) return json(res, 400, { sucesso: false, erro: 'lead_id ausente' });

  let lead;
  try {
    lead = await loadLead(leadId);
  } catch {
    return json(res, 404, { sucesso: false, erro: 'Aluno não encontrado' });
  }

  const leadAcademy = String(lead.academyId || lead.academy_id || '').trim();
  if (leadAcademy && leadAcademy !== academyId) {
    return json(res, 403, { sucesso: false, erro: 'Aluno de outra academia' });
  }

  try {
    const { config } = await getConfigForAcademy(academyId);
    const photoUrl = String(req.body?.photo_url || lead.photo_url || lead.photoUrl || '').trim();
    const { userId } = await syncStudentOnDevice(config, { leadDoc: lead, photoUrl });

    await patchLeadSyncState(leadId, {
      controlid_user_id: userId,
      device_id: userId,
      controlid_synced: true,
      controlid_sync_error: null,
    });

    return json(res, 200, { sucesso: true, controlid_user_id: userId });
  } catch (e) {
    const errMsg = String(e?.message || 'Erro de sincronização').slice(0, 256);
    try {
      await patchLeadSyncState(leadId, {
        controlid_synced: false,
        controlid_sync_error: errMsg,
      });
    } catch {
      void 0;
    }
    return json(res, 200, { sucesso: false, erro: errMsg, relay_required: e?.code === 'not_configured' });
  }
}

export async function controlidRevokeHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const leadId = String(req.body?.lead_id || req.body?.leadId || '').trim();
  if (!leadId) return json(res, 400, { sucesso: false, erro: 'lead_id ausente' });

  let lead;
  try {
    lead = await loadLead(leadId);
  } catch {
    return json(res, 404, { sucesso: false, erro: 'Aluno não encontrado' });
  }

  const userId = resolveControlIdUserId(lead);
  if (!userId) {
    await patchLeadSyncState(leadId, { controlid_synced: false });
    return json(res, 200, { sucesso: true, skipped: true });
  }

  try {
    const { config } = await getConfigForAcademy(academyId);
    await destroyUser(config, userId);
  } catch (e) {
    const errMsg = String(e?.message || 'Erro ao revogar').slice(0, 256);
    await patchLeadSyncState(leadId, { controlid_sync_error: errMsg });
    return json(res, 200, { sucesso: false, erro: errMsg });
  }

  await patchLeadSyncState(leadId, {
    controlid_synced: false,
    controlid_sync_error: null,
  });
  return json(res, 200, { sucesso: true });
}

export async function controlidReleaseHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  try {
    const { config } = await getConfigForAcademy(academyId);
    await releaseGate(config);

    await addLeadEventServer({
      academyId,
      leadId: String(req.body?.lead_id || '').trim() || 'academy',
      type: 'manual_release',
      text: 'Liberação manual da catraca — recepção',
      createdBy: me.$id || 'user',
      payloadJson: { source: 'controlid', portal_id: config.portal_id },
    });

    return json(res, 200, { sucesso: true });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: e?.message || 'Falha ao liberar catraca' });
  }
}

async function processAccessEvent(academyId, event) {
  const userId = Number(event.user_id ?? event.userId);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const list = await databases.listDocuments(DB_ID, LEADS_COL, [
    Query.equal('academyId', [academyId]),
    Query.equal('controlid_user_id', [userId]),
    Query.limit(1),
  ]);
  let student = list.documents?.[0];
  if (!student) {
    const legacy = await databases.listDocuments(DB_ID, LEADS_COL, [
      Query.equal('academyId', [academyId]),
      Query.equal('device_id', [userId]),
      Query.limit(1),
    ]);
    student = legacy.documents?.[0];
  }
  if (!student) return null;

  const ts = Number(event.time ?? event.timestamp ?? Date.now() / 1000);
  const log = {
    id: event.id ?? `${userId}-${ts}`,
    user_id: userId,
    time: ts,
    portal_id: event.portal_id ?? event.portalId,
  };

  if (ATTENDANCE_COL) {
    try {
      const existing = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('device_log_id', String(log.id)),
        Query.limit(1),
      ]);
      if (existing.total === 0) {
        await databases.createDocument(
          DB_ID,
          ATTENDANCE_COL,
          ID.unique(),
          buildControlIdAttendanceDocument({ academyId, student, log })
        );
      }
    } catch (e) {
      console.warn('[controlid_monitor] attendance', e?.message);
    }
  }

  await addLeadEventServer({
    academyId,
    leadId: student.$id,
    type: 'attendance',
    text: 'Presença registrada pela catraca',
    at: new Date(ts * 1000).toISOString(),
    createdBy: 'controlid',
    payloadJson: {
      source: 'controlid',
      portal_id: log.portal_id,
      user_id: userId,
    },
  });

  return { leadId: student.$id, name: student.name, at: new Date(ts * 1000).toISOString() };
}

export async function controlidTestImageHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  const leadId = String(req.body?.lead_id || '').trim();
  const imageBase64 = String(req.body?.image_base64 || '').trim();
  if (!imageBase64) return json(res, 400, { sucesso: false, erro: 'image_base64 ausente' });

  try {
    const { config } = await getConfigForAcademy(academyId);
    let userId = Number(req.body?.user_id);
    if (!Number.isFinite(userId) || userId <= 0) {
      if (leadId) {
        try {
          const lead = await loadLead(leadId);
          userId = resolveControlIdUserId(lead) || buildControlIdUserId(leadId);
        } catch {
          userId = buildControlIdUserId(leadId);
        }
      } else {
        userId = 1;
      }
    }
    const bytes = Buffer.from(imageBase64, 'base64');
    const result = await testUserImage(config, { userId, photoBytes: bytes });
    return json(res, 200, { sucesso: true, result });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: e?.message || 'Falha no teste da foto' });
  }
}

export async function controlidMonitorHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  }
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  try {
    const { config } = await getConfigForAcademy(academyId);
    const events = await pollAccessEvents(config);
    const processed = [];
    for (const ev of events) {
      const row = await processAccessEvent(academyId, ev);
      if (row) processed.push(row);
    }
    return json(res, 200, { sucesso: true, events: processed, raw_count: events.length });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: e?.message || 'Monitor indisponível', events: [] });
  }
}
