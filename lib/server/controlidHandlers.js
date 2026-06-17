import { apiErro, logApiError } from './friendlyError.js';
import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess, ensureAcademyOwnerOrAdmin, isAcademyOwnerOrAdminUser } from './academyAccess.js';
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
import {
  mergeControlIdIntoSettings,
  parseAcademySettings,
  readControlIdConfig,
  resolveControlIdUserId,
  normalizeRelayUrl,
  validateRelayUrl,
} from '../controlidSettings.js';
import { addLeadEventServer } from './leadEvents.js';
import { buildControlIdAttendanceDocument } from '../attendanceDocument.js';
import { clearRetentionInContact } from './studentRetentionContact.js';
import { normalizeReleaseReason, validateReleaseReason } from '../controlidRelease.js';
import { clampEntryCooldownMinutes, entryCooldownSinceIso } from '../controlidCooldown.js';
import { shouldDenyOverdueAttendance } from './controlidOverdueAccess.js';
import { academyHasFinanceModule } from '../../src/lib/collectionRules.js';

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
const STUDENTS_COL =
  process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || process.env.APPWRITE_STUDENTS_COLLECTION_ID || '';
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
  if (STUDENTS_COL) {
    try {
      return await databases.getDocument(DB_ID, STUDENTS_COL, leadId);
    } catch {
      /* legacy */
    }
  }
  return databases.getDocument(DB_ID, LEADS_COL, leadId);
}

function patchLeadSyncState(leadId, patch) {
  if (STUDENTS_COL) {
    return databases
      .updateDocument(DB_ID, STUDENTS_COL, leadId, patch)
      .catch(() => databases.updateDocument(DB_ID, LEADS_COL, leadId, patch));
  }
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

function safeControlIdStatusFromSettings(settings) {
  const cfg = readControlIdConfig(settings);
  const s = parseAcademySettings(settings);
  const raw = s?.controlid && typeof s.controlid === 'object' ? s.controlid : {};
  const configured = Boolean(String(cfg.passwordEncrypted || '').trim());
  return {
    configured,
    connected: raw.connected === true || raw.last_connected === true,
    device_ip: cfg.ip || '',
    last_sync: cfg.last_sync || '',
    enabled: cfg.enabled === true,
  };
}

async function touchControlIdLastSync(academyId) {
  const academy = await loadAcademy(academyId);
  const merged = mergeControlIdIntoSettings(academy.settings, {
    last_sync: new Date().toISOString(),
  });
  await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
    settings: JSON.stringify(merged),
  });
}

/** GET /api/control-id/status — sem credenciais ou ciphertext. */
export async function controlidStatusHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId, doc } = access;

  const base = safeControlIdStatusFromSettings(doc.settings);
  const isAdmin = await isAcademyOwnerOrAdminUser(doc, me);
  const cfg = readControlIdConfig(doc.settings);

  const payload = {
    sucesso: true,
    ...base,
    block_overdue_access: cfg.block_overdue_access === true,
  };

  if (isAdmin) {
    payload.port = cfg.port;
    payload.username = cfg.username;
    payload.portal_id = cfg.portal_id;
    payload.relay_url = cfg.relay_url || '';
    payload.entry_cooldown_minutes = cfg.entry_cooldown_minutes;
    payload.finance_module = academyHasFinanceModule(doc);
  }

  return json(res, 200, payload);
}

export async function controlidTestHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
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

    const relay_url =
      body.relay_url !== undefined
        ? normalizeRelayUrl(body.relay_url)
        : saved.relay_url;

    const relayErr = validateRelayUrl(relay_url);
    if (relayErr) {
      return json(res, 400, { sucesso: false, erro: relayErr });
    }

    const config = {
      enabled: true,
      ip,
      port,
      username,
      password,
      portal_id: saved.portal_id,
      relay_url,
    };
    const result = await testConnection(config);
    return json(res, 200, {
      sucesso: true,
      portals: result.portals || [],
      message: 'Conexão com a catraca estabelecida',
    });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

export async function controlidSaveConfigHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
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

    const relay_url =
      body.relay_url !== undefined
        ? normalizeRelayUrl(body.relay_url)
        : prev.relay_url;
    const relayErr = validateRelayUrl(relay_url);
    if (relayErr) {
      return json(res, 400, { sucesso: false, erro: relayErr });
    }

    const entry_cooldown_minutes =
      body.entry_cooldown_minutes !== undefined
        ? clampEntryCooldownMinutes(body.entry_cooldown_minutes)
        : prev.entry_cooldown_minutes;

    let block_overdue_access = prev.block_overdue_access === true;
    if (body.block_overdue_access !== undefined) {
      const wantsBlock = body.block_overdue_access === true;
      if (wantsBlock && !academyHasFinanceModule(academy)) {
        return json(res, 400, {
          sucesso: false,
          erro: 'Ative o módulo financeiro para bloquear inadimplentes na catraca.',
        });
      }
      block_overdue_access = wantsBlock;
    }

    const merged = mergeControlIdIntoSettings(academy.settings, {
      enabled: body.enabled !== false,
      ip: String(body.ip || prev.ip || '').trim(),
      port: Number(body.port ?? prev.port) || 80,
      username: String(body.username || prev.username || 'admin').trim(),
      passwordEncrypted,
      portal_id: Number(body.portal_id ?? prev.portal_id) || 1,
      relay_url,
      entry_cooldown_minutes,
      block_overdue_access,
    });

    await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
      settings: JSON.stringify(merged),
    });

    return json(res, 200, { sucesso: true });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'save') });
  }
}

/** Sincroniza aluno na catraca (uso interno: cron de trancamento, etc.). */
export async function controlidSyncLeadServer(academyId, leadId) {
  const lead = await loadLead(leadId);
  const { config } = await getConfigForAcademy(academyId);
  if (shouldDenyOverdueAttendance(config, lead)) {
    return { skipped: true, skipped_reason: 'overdue' };
  }
  const photoUrl = String(lead.photo_url || lead.photoUrl || '').trim();
  const { userId } = await syncStudentOnDevice(config, { leadDoc: lead, photoUrl });
  await patchLeadSyncState(leadId, {
    controlid_user_id: userId,
    device_id: userId,
    controlid_synced: true,
    controlid_sync_error: null,
  });
  await touchControlIdLastSync(academyId);
  return { userId };
}

export async function controlidSyncHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
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
    if (shouldDenyOverdueAttendance(config, lead)) {
      return json(res, 200, {
        sucesso: false,
        skipped: true,
        skipped_reason: 'overdue',
        erro: 'Aluno inadimplente — sincronização bloqueada enquanto o bloqueio na catraca estiver ativo.',
      });
    }
    const photoUrl = String(req.body?.photo_url || lead.photo_url || lead.photoUrl || '').trim();
    const { userId } = await syncStudentOnDevice(config, { leadDoc: lead, photoUrl });

    await patchLeadSyncState(leadId, {
      controlid_user_id: userId,
      device_id: userId,
      controlid_synced: true,
      controlid_sync_error: null,
    });

    await touchControlIdLastSync(academyId);

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
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
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

  const reason = normalizeReleaseReason(req.body?.reason);
  const reasonErr = validateReleaseReason(reason);
  if (reasonErr) {
    return json(res, 400, { sucesso: false, erro: reasonErr });
  }

  const releasedByName = String(me.name || me.email || 'Usuário').trim().slice(0, 128) || 'Usuário';

  try {
    const { config } = await getConfigForAcademy(academyId);
    await releaseGate(config, { reason });

    await addLeadEventServer({
      academyId,
      leadId: String(req.body?.lead_id || '').trim() || 'academy',
      type: 'manual_release',
      text: `Liberação manual: ${reason.slice(0, 120)}`,
      createdBy: me.$id || 'user',
      payloadJson: {
        source: 'controlid',
        portal_id: config.portal_id,
        reason,
        released_by: me.$id || 'user',
        released_by_name: releasedByName,
      },
    });

    return json(res, 200, { sucesso: true });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: apiErro(e, 'action') });
  }
}

async function hasRecentStudentAttendance(academyId, studentId, cooldownMinutes) {
  const sinceIso = entryCooldownSinceIso(cooldownMinutes);
  if (!sinceIso || !ATTENDANCE_COL || !studentId) return false;

  try {
    const recent = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
      Query.equal('academy_id', academyId),
      Query.equal('student_id', studentId),
      Query.greaterThan('checked_in_at', sinceIso),
      Query.limit(1),
    ]);
    return (recent.total ?? 0) > 0;
  } catch (e) {
    console.warn('[controlid_monitor] cooldown lookup', e?.message);
    return false;
  }
}

async function processAccessEvent(academyId, event, config = {}) {
  const userId = Number(event.user_id ?? event.userId);
  if (!Number.isFinite(userId) || userId <= 0) return null;

  const cols = [STUDENTS_COL, LEADS_COL].filter(Boolean);
  let student = null;
  for (const col of cols) {
    const list = await databases.listDocuments(DB_ID, col, [
      Query.equal('academyId', [academyId]),
      Query.equal('controlid_user_id', [userId]),
      Query.limit(1),
    ]);
    student = list.documents?.[0];
    if (student) break;
    const legacy = await databases.listDocuments(DB_ID, col, [
      Query.equal('academyId', [academyId]),
      Query.equal('device_id', [userId]),
      Query.limit(1),
    ]);
    student = legacy.documents?.[0];
    if (student) break;
  }
  if (!student) return null;

  if (shouldDenyOverdueAttendance(config, student)) {
    await addLeadEventServer({
      academyId,
      leadId: student.$id,
      type: 'attendance_denied',
      text: 'Entrada ignorada — aluno inadimplente (catraca)',
      createdBy: 'controlid',
      payloadJson: {
        source: 'controlid',
        reason: 'overdue',
        user_id: userId,
      },
    });
    return {
      leadId: student.$id,
      name: student.name,
      skipped: 'overdue',
    };
  }

  const cooldownMin = clampEntryCooldownMinutes(config.entry_cooldown_minutes);
  if (cooldownMin > 0) {
    const blocked = await hasRecentStudentAttendance(academyId, student.$id, cooldownMin);
    if (blocked) {
      return {
        leadId: student.$id,
        name: student.name,
        skipped: 'cooldown',
      };
    }
  }

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

  void clearRetentionInContact(databases, DB_ID, student.$id);

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
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
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
    return json(res, 200, { sucesso: false, erro: apiErro(e, 'action') });
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
    const ignored = [];
    let skippedCooldown = 0;
    let skippedOverdue = 0;
    for (const ev of events) {
      const row = await processAccessEvent(academyId, ev, config);
      if (row?.skipped === 'cooldown') {
        skippedCooldown += 1;
        ignored.push({ leadId: row.leadId, name: row.name, reason: 'cooldown' });
        continue;
      }
      if (row?.skipped === 'overdue') {
        skippedOverdue += 1;
        ignored.push({ leadId: row.leadId, name: row.name, reason: 'overdue' });
        continue;
      }
      if (row) processed.push(row);
    }
    return json(res, 200, {
      sucesso: true,
      events: processed,
      ignored,
      raw_count: events.length,
      skipped_cooldown: skippedCooldown,
      skipped_overdue: skippedOverdue,
    });
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: apiErro(e, 'action'), events: [] });
  }
}

/** GET /api/control-id/attendance — lista registros de presença do Appwrite. */
export async function controlidAttendanceHandler(req, res) {
  if (req.method !== 'GET') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyAccess(req, res, me);
  if (!access) return;
  const { academyId } = access;

  if (!ATTENDANCE_COL) return json(res, 200, { sucesso: true, records: [], total: 0 });

  const q = req.query || {};
  const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
  const studentId = String(q.student_id || '').trim();
  const startIso = String(q.start || '').trim();
  const endIso = String(q.end || '').trim();
  const sinceIso = String(q.since || '').trim();

  try {
    const filters = [
      Query.equal('academy_id', academyId),
      Query.orderDesc('checked_in_at'),
      Query.limit(limit),
    ];
    if (studentId) filters.push(Query.equal('student_id', studentId));
    if (sinceIso) filters.push(Query.greaterThanEqual('checked_in_at', sinceIso));
    else if (startIso) filters.push(Query.greaterThanEqual('checked_in_at', startIso));
    if (endIso) filters.push(Query.lessThanEqual('checked_in_at', endIso));

    const res2 = await databases.listDocuments(DB_ID, ATTENDANCE_COL, filters);
    return json(res, 200, { sucesso: true, records: res2.documents || [], total: res2.total ?? 0 });
  } catch (e) {
    return json(res, 500, { sucesso: false, erro: apiErro(e, 'load') });
  }
}

/** POST /api/control-id/sync-all — sincroniza todos os alunos ativos com foto. */
export async function controlidSyncAllHandler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
  const me = await ensureAuth(req, res);
  if (!me) return;
  const access = await ensureAcademyOwnerOrAdmin(req, res, me);
  if (!access) return;
  const { academyId } = access;

  let config;
  try {
    ({ config } = await getConfigForAcademy(academyId));
  } catch (e) {
    return json(res, 200, { sucesso: false, erro: apiErro(e, 'action') });
  }

  const col = STUDENTS_COL || LEADS_COL;
  if (!col) return json(res, 503, { sucesso: false, erro: 'Coleção de alunos não configurada' });

  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let skippedOverdue = 0;
  const errors = [];
  let cursor = null;

  for (;;) {
    const qFilters = [
      Query.equal('academyId', [academyId]),
      Query.notEqual('student_status', ['inactive']),
      Query.limit(50),
    ];
    if (cursor) qFilters.push(Query.cursorAfter(cursor));

    let page;
    try {
      page = await databases.listDocuments(DB_ID, col, qFilters);
    } catch {
      break;
    }

    const docs = page.documents || [];
    for (const doc of docs) {
      const photoUrl = String(doc.photo_url || doc.photoUrl || '').trim();
      if (!photoUrl) { skipped += 1; continue; }
      if (shouldDenyOverdueAttendance(config, doc)) {
        skippedOverdue += 1;
        continue;
      }

      try {
        const { userId } = await syncStudentOnDevice(config, { leadDoc: doc, photoUrl });
        await databases.updateDocument(DB_ID, col, doc.$id, {
          controlid_user_id: userId,
          controlid_synced: true,
          controlid_sync_error: null,
        });
        synced += 1;
      } catch (e) {
        failed += 1;
        const msg = String(e?.message || 'Erro').slice(0, 256);
        errors.push({ id: doc.$id, name: doc.name, erro: msg });
        try {
          await databases.updateDocument(DB_ID, col, doc.$id, {
            controlid_synced: false,
            controlid_sync_error: msg,
          });
        } catch { void 0; }
      }
    }

    if (docs.length < 50) break;
    cursor = docs[docs.length - 1].$id;
  }

  try {
    await touchControlIdLastSync(academyId);
  } catch (e) {
    console.warn('[controlid_sync_all] last_sync', e?.message);
  }

  return json(res, 200, { sucesso: true, synced, failed, skipped, skipped_overdue: skippedOverdue, errors });
}
