import { Client, Users, Teams, ID, Databases, Account, Query } from 'node-appwrite';
import { getAppwriteUserFromJwt } from './authAppwrite.js';
import {
  ensureAcademyAccess,
  isAcademyOwnerOrAdminUser,
  databases as sharedDb,
  DB_ID,
  invalidateAcademyAccessCache,
} from './academyAccess.js';
import {
  recordAcademyEvent,
  listTeamAcademyEventsServer,
  formatTeamEventDescription,
  TEAM_EVENT_TYPES,
} from './academyEvents.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID ||
  process.env.APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT ||
  process.env.VITE_APPWRITE_PROJECT_ID ||
  '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

const APP_BASE_URL = String(
  process.env.VITE_APP_URL || process.env.APP_URL || process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : ''
).trim() || 'http://localhost:5173';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = sharedDb || new Databases(adminClient);
const users = new Users(adminClient);
const teams = new Teams(adminClient);

function json(res, status, body) {
  return res.status(status).json(body);
}

function roleLabelPt(teamRole) {
  if (teamRole === 'admin') return 'Administrador';
  if (teamRole === 'receptionist') return 'Recepcionista';
  if (teamRole === 'owner') return 'Titular';
  return teamRole;
}

function membershipTeamRole(m, academyOwnerId) {
  const roles = Array.isArray(m?.roles) ? m.roles : [];
  const userId = String(m?.userId || '').trim();
  const ownerId = String(academyOwnerId || '').trim();
  if (roles.includes('owner') || (ownerId && userId && userId === ownerId)) return 'owner';
  if (roles.includes('admin')) return 'admin';
  return 'receptionist';
}

function appwriteRolesForTeamRole(teamRole) {
  if (teamRole === 'admin') return ['admin'];
  return ['member'];
}

function teamRoleFromBody(role) {
  const r = String(role || '').trim().toLowerCase();
  if (r === 'admin' || r === 'administrador') return 'admin';
  return 'receptionist';
}

async function getMembership(teamId, membershipId) {
  const list = await teams.listMemberships(teamId);
  return (list.memberships || []).find((m) => m.$id === membershipId) || null;
}

async function getMembershipByUserId(teamId, userId) {
  const list = await teams.listMemberships(teamId);
  return (list.memberships || []).find((m) => String(m.userId || '') === String(userId)) || null;
}

function actorName(user) {
  return String(user?.name || user?.email || 'Usuário').trim() || 'Usuário';
}

async function enrichMembershipFromUser(m) {
  let userName = String(m?.userName || m?.name || '').trim();
  let userEmail = String(m?.userEmail || m?.email || '').trim();
  const userId = String(m?.userId || '').trim();
  if ((!userName || !userEmail) && userId) {
    try {
      const u = await users.get(userId);
      if (!userName) userName = String(u.name || '').trim();
      if (!userEmail) userEmail = String(u.email || '').trim();
    } catch {
      void 0;
    }
  }
  if (!userName && !userEmail) return m;
  return {
    ...m,
    ...(userName ? { userName } : {}),
    ...(userEmail ? { userEmail } : {}),
  };
}

async function assertAcademyTeamAccess(sessionUser, academyIdStr) {
  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  const ownerId = String(academyDoc?.ownerId || '').trim();
  const userId = String(sessionUser?.$id || '').trim();
  if (ownerId && userId && ownerId === userId) return academyDoc;

  const teamId = String(academyDoc?.teamId || '').trim();
  if (!teamId || !userId) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  const membership = await getMembershipByUserId(teamId, userId);
  if (!membership) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }
  return academyDoc;
}

function inviteUrl() {
  const base = APP_BASE_URL.replace(/\/$/, '');
  return `${base}/login`;
}

function generateTempPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$';
  let out = '';
  for (let i = 0; i < 14; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

async function findUserByEmail(emailStr) {
  try {
    const list = await users.list([Query.equal('email', [emailStr]), Query.limit(5)]);
    return (
      (list.users || []).find((u) => String(u.email || '').trim().toLowerCase() === emailStr) || null
    );
  } catch {
    return null;
  }
}

async function createMembershipForUser(teamId, roles, userId, displayName) {
  const existing = await getMembershipByUserId(teamId, userId);
  if (existing) {
    const err = new Error('already_member');
    err.code = 'ALREADY_MEMBER';
    throw err;
  }
  return teams.createMembership({ teamId, roles, userId, name: displayName });
}

async function assertCanManageTarget(sessionUser, academyDoc, targetMembership) {
  const actorId = sessionUser.$id;
  const isOwner = String(academyDoc.ownerId || '') === String(actorId);
  const actorIsAdmin = await isAcademyOwnerOrAdminUser(academyDoc, sessionUser);
  if (!isOwner && !actorIsAdmin) {
    const err = new Error('forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  const targetRole = membershipTeamRole(targetMembership, academyDoc.ownerId);
  if (targetRole === 'owner') {
    const err = new Error('forbidden_target');
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (!isOwner) {
    if (targetRole !== 'receptionist') {
      const err = new Error('forbidden_target');
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (String(targetMembership.userId || '') === String(actorId)) {
      const err = new Error('forbidden_self');
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  return { isOwner, targetRole };
}

export default async function handler(req, res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return json(res, 500, { erro: 'Configuração Appwrite ausente' });
  }

  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return json(res, 401, { erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return json(res, 401, { erro: 'JWT inválido' });

    const sessionUser = await getAppwriteUserFromJwt(jwt);
    if (!sessionUser) return json(res, 401, { erro: 'Não autenticado' });

    if (req.method === 'GET' && String(req.query?.list || '') === '1') {
      return handleListMembers(req, res, sessionUser);
    }

    if (req.method === 'GET' && String(req.query?.events || '') === '1') {
      return handleListEvents(req, res, sessionUser);
    }

    if (req.method === 'POST' && String(req.body?.action || '') === 'password_reset') {
      return handlePasswordReset(req, res, sessionUser);
    }

    if (req.method === 'POST') {
      return handleCreateMember(req, res, sessionUser);
    }

    if (req.method === 'PATCH') {
      return handleUpdateMember(req, res, sessionUser);
    }

    if (req.method === 'DELETE') {
      return handleRemoveMember(req, res, sessionUser);
    }

    return json(res, 405, { erro: 'Method Not Allowed' });
  } catch (error) {
    console.error('[/api/team/members]', error);
    return json(res, 500, { erro: error.message || 'Erro interno' });
  }
}

async function handleListMembers(req, res, sessionUser) {
  const academyIdStr = String(req.query.academyId || '').trim();
  if (!academyIdStr) return json(res, 400, { erro: 'academyId obrigatório' });

  let academyDoc;
  try {
    academyDoc = await assertAcademyTeamAccess(sessionUser, academyIdStr);
  } catch (e) {
    if (e.code === 'FORBIDDEN') return json(res, 403, { erro: 'Sem permissão para ver a equipe' });
    throw e;
  }

  const teamId = String(academyDoc?.teamId || '').trim();
  if (!teamId) return json(res, 200, { sucesso: true, memberships: [] });

  const list = await teams.listMemberships(teamId);
  const raw = Array.isArray(list?.memberships) ? list.memberships : [];
  const memberships = await Promise.all(raw.map((m) => enrichMembershipFromUser(m)));

  return json(res, 200, { sucesso: true, memberships });
}

async function handleListEvents(req, res, sessionUser) {
  const academyIdStr = String(req.query.academyId || '').trim();
  if (!academyIdStr) return json(res, 400, { erro: 'academyId obrigatório' });

  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  if (String(academyDoc.ownerId || '') !== String(sessionUser.$id)) {
    return json(res, 403, { erro: 'Apenas o titular pode ver o histórico' });
  }

  const limit = Number(req.query.limit) || 10;
  const offset = Number(req.query.offset) || 0;
  const { documents, total } = await listTeamAcademyEventsServer(academyIdStr, { limit, offset });

  const events = documents.map((doc) => ({
    id: doc.$id,
    timestamp: doc.timestamp || doc.$createdAt,
    description: formatTeamEventDescription(doc),
    actor_name: doc.actor_name,
    target_name: doc.target_name,
    event_type: doc.event_type,
  }));

  return json(res, 200, { sucesso: true, events, total, hasMore: offset + documents.length < total });
}

async function handleCreateMember(req, res, sessionUser) {
  const { name, email, role, teamId, academyId } = req.body || {};
  const academyIdStr = String(academyId || '').trim();
  const displayName = String(name || '').trim();
  const emailStr = String(email || '').trim().toLowerCase();
  const newTeamRole = teamRoleFromBody(role);

  if (!academyIdStr) return json(res, 400, { erro: 'academyId obrigatório' });
  if (!teamId) return json(res, 400, { erro: 'teamId obrigatório' });
  if (!displayName) return json(res, 400, { erro: 'Nome é obrigatório' });
  if (!emailStr || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return json(res, 400, { erro: 'E-mail inválido' });
  }

  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  if (String(academyDoc?.teamId || '').trim() !== String(teamId || '').trim()) {
    return json(res, 403, { erro: 'teamId não pertence a esta academia' });
  }

  const isOwner = String(academyDoc.ownerId || '') === String(sessionUser.$id);
  const actorIsAdmin = await isAcademyOwnerOrAdminUser(academyDoc, sessionUser);
  if (!isOwner && !actorIsAdmin) {
    return json(res, 403, { erro: 'Sem permissão para adicionar membros' });
  }
  if (!isOwner && newTeamRole === 'admin') {
    return json(res, 403, { erro: 'Administradores só podem adicionar recepcionistas' });
  }

  const roles = appwriteRolesForTeamRole(newTeamRole);
  let inviteSent = false;
  let tempPassword = null;
  let readded = false;
  let newUser = null;
  let membership = null;

  try {
    membership = await teams.createMembership({
      teamId,
      roles,
      email: emailStr,
      name: displayName,
      url: inviteUrl(),
    });
    inviteSent = true;
  } catch (inviteErr) {
    console.warn('[team] invite via email falhou, tentando usuário existente ou criação:', inviteErr?.message || inviteErr);

    const existingUser = await findUserByEmail(emailStr);
    if (existingUser) {
      try {
        membership = await createMembershipForUser(teamId, roles, existingUser.$id, displayName);
        newUser = existingUser;
        readded = true;
      } catch (memberErr) {
        if (memberErr.code === 'ALREADY_MEMBER') {
          return json(res, 409, { erro: 'Este e-mail já faz parte da equipe.' });
        }
        throw memberErr;
      }
    } else {
      tempPassword = generateTempPassword();
      try {
        newUser = await users.create(ID.unique(), emailStr, undefined, tempPassword, displayName);
      } catch (e) {
        if (e.code === 409) {
          const racedUser = await findUserByEmail(emailStr);
          if (!racedUser) {
            return json(res, 409, { erro: 'Já existe um usuário com este e-mail' });
          }
          try {
            membership = await createMembershipForUser(teamId, roles, racedUser.$id, displayName);
            newUser = racedUser;
            readded = true;
            tempPassword = null;
          } catch (memberErr) {
            if (memberErr.code === 'ALREADY_MEMBER') {
              return json(res, 409, { erro: 'Este e-mail já faz parte da equipe.' });
            }
            throw memberErr;
          }
        } else {
          throw e;
        }
      }
      if (!readded && newUser) {
        try {
          membership = await createMembershipForUser(teamId, roles, newUser.$id, displayName);
          inviteSent = false;
        } catch (memberErr) {
          try {
            await users.delete(newUser.$id);
          } catch {
            void 0;
          }
          if (memberErr.code === 'ALREADY_MEMBER') {
            return json(res, 409, { erro: 'Este e-mail já faz parte da equipe.' });
          }
          return json(res, 500, { erro: 'Erro ao associar o usuário ao time da academia' });
        }
      }
    }
  }

  await recordAcademyEvent({
    event_type: TEAM_EVENT_TYPES.ADDED,
    academy_id: academyIdStr,
    actor_user_id: sessionUser.$id,
    actor_name: actorName(sessionUser),
    target_user_id: String(newUser?.$id || membership?.userId || '').trim(),
    target_name: displayName,
    new_role: roleLabelPt(newTeamRole),
    timestamp: new Date().toISOString(),
  });

  const addedUserId = String(newUser?.$id || membership?.userId || '').trim();
  if (addedUserId) {
    invalidateAcademyAccessCache(academyIdStr, { userId: addedUserId, teamId });
  }

  return json(res, 200, {
    sucesso: true,
    inviteSent,
    readded,
    tempPassword: inviteSent || readded ? null : tempPassword,
    memberId: newUser?.$id || membership?.userId || null,
    membershipId: membership?.$id || null,
    displayName,
    memberEmail: emailStr,
    roleLabel: roleLabelPt(newTeamRole),
    role: newTeamRole,
  });
}

async function handleUpdateMember(req, res, sessionUser) {
  const body = req.body || {};
  const academyIdStr = String(body.academyId || '').trim();
  const teamId = String(body.teamId || '').trim();
  const membershipId = String(body.membershipId || '').trim();
  const userId = String(body.userId || '').trim();
  const displayName = body.name != null ? String(body.name).trim() : null;
  const emailStr = body.email != null ? String(body.email).trim().toLowerCase() : null;
  const newTeamRole = body.role != null ? teamRoleFromBody(body.role) : null;

  if (!academyIdStr || !teamId) return json(res, 400, { erro: 'academyId e teamId obrigatórios' });
  if (!membershipId && !userId) return json(res, 400, { erro: 'membershipId ou userId obrigatório' });

  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  if (String(academyDoc?.teamId || '').trim() !== teamId) {
    return json(res, 403, { erro: 'teamId não pertence a esta academia' });
  }

  let membership = membershipId ? await getMembership(teamId, membershipId) : await getMembershipByUserId(teamId, userId);
  if (!membership) return json(res, 404, { erro: 'Membro não encontrado' });

  const isOwner = String(academyDoc.ownerId || '') === String(sessionUser.$id);
  try {
    await assertCanManageTarget(sessionUser, academyDoc, membership);
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, { erro: 'Sem permissão para editar este membro' });
    }
    throw e;
  }

  const targetUserId = String(membership.userId || userId || '').trim();
  const prevRole = membershipTeamRole(membership, academyDoc.ownerId);
  const changedFields = [];
  const previousValues = {};
  const newValues = {};
  let emailReconfirm = false;

  if (displayName) {
    if (!targetUserId) {
      return json(res, 400, { erro: 'Membro ainda não aceitou o convite — não é possível alterar o nome' });
    }
    await users.updateName({ userId: targetUserId, name: displayName });
    changedFields.push('name');
    previousValues.name = String(membership.userName || membership.name || '');
    newValues.name = displayName;
  }

  if (emailStr) {
    if (!isOwner) {
      return json(res, 403, { erro: 'Apenas o titular pode alterar e-mail de membros' });
    }
    if (!targetUserId) {
      return json(res, 400, { erro: 'Membro ainda não aceitou o convite — altere o e-mail após o aceite' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
      return json(res, 400, { erro: 'E-mail inválido' });
    }
    const prevEmail = String(membership.userEmail || membership.email || '').trim();
    try {
      await users.updateEmail({ userId: targetUserId, email: emailStr });
      emailReconfirm = true;
    } catch (e) {
      return json(res, 400, { erro: e?.message || 'Não foi possível alterar o e-mail' });
    }
    changedFields.push('email');
    previousValues.email = prevEmail;
    newValues.email = emailStr;
  }

  if (newTeamRole) {
    if (!isOwner) {
      if (newTeamRole === 'admin') {
        return json(res, 403, { erro: 'Administradores não podem promover membros a administrador' });
      }
      if (prevRole !== 'receptionist') {
        return json(res, 403, { erro: 'Sem permissão para alterar o papel deste membro' });
      }
    }
    if (newTeamRole === 'owner') {
      return json(res, 403, { erro: 'Não é possível atribuir papel de titular' });
    }
    await teams.updateMembershipRoles(teamId, membership.$id, appwriteRolesForTeamRole(newTeamRole));
    changedFields.push('role');
    previousValues.role = roleLabelPt(prevRole);
    newValues.role = roleLabelPt(newTeamRole);
  }

  if (changedFields.length === 0) {
    return json(res, 400, { erro: 'Nenhum campo para atualizar' });
  }

  const targetName = displayName || String(membership.userName || membership.name || '').trim() || 'Membro';

  await recordAcademyEvent({
    event_type: TEAM_EVENT_TYPES.UPDATED,
    academy_id: academyIdStr,
    actor_user_id: sessionUser.$id,
    actor_name: actorName(sessionUser),
    target_user_id: targetUserId,
    target_name: targetName,
    previous_role: roleLabelPt(prevRole),
    new_role: newTeamRole ? roleLabelPt(newTeamRole) : roleLabelPt(prevRole),
    changed_fields: changedFields,
    previous_values: previousValues,
    new_values: newValues,
    timestamp: new Date().toISOString(),
  });

  if (targetUserId) {
    invalidateAcademyAccessCache(academyIdStr, { userId: targetUserId, teamId });
  }

  return json(res, 200, {
    sucesso: true,
    displayName: displayName || undefined,
    memberEmail: emailStr || undefined,
    role: newTeamRole || undefined,
    roleLabel: newTeamRole ? roleLabelPt(newTeamRole) : undefined,
    emailReconfirm,
    changedFields,
  });
}

async function handleRemoveMember(req, res, sessionUser) {
  const body = req.body || {};
  const academyIdStr = String(body.academyId || '').trim();
  const teamId = String(body.teamId || '').trim();
  const membershipId = String(body.membershipId || '').trim();

  if (!academyIdStr || !teamId || !membershipId) {
    return json(res, 400, { erro: 'academyId, teamId e membershipId obrigatórios' });
  }

  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  if (String(academyDoc?.teamId || '').trim() !== teamId) {
    return json(res, 403, { erro: 'teamId não pertence a esta academia' });
  }

  const membership = await getMembership(teamId, membershipId);
  if (!membership) return json(res, 404, { erro: 'Membro não encontrado' });

  try {
    await assertCanManageTarget(sessionUser, academyDoc, membership);
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, { erro: 'Sem permissão para remover este membro' });
    }
    throw e;
  }

  if (String(membership.userId || '') === String(sessionUser.$id)) {
    return json(res, 403, { erro: 'Não é possível remover a si mesmo' });
  }

  const targetName = String(membership.userName || membership.name || membership.userEmail || 'Membro').trim();
  const prevRole = membershipTeamRole(membership, academyDoc.ownerId);

  await teams.deleteMembership(teamId, membershipId);

  const removedUserId = String(membership.userId || '').trim();
  invalidateAcademyAccessCache(academyIdStr, { userId: removedUserId, teamId });

  await recordAcademyEvent({
    event_type: TEAM_EVENT_TYPES.REMOVED,
    academy_id: academyIdStr,
    actor_user_id: sessionUser.$id,
    actor_name: actorName(sessionUser),
    target_user_id: removedUserId,
    target_name: targetName,
    previous_role: roleLabelPt(prevRole),
    timestamp: new Date().toISOString(),
  });

  return json(res, 200, { sucesso: true });
}

async function handlePasswordReset(req, res, sessionUser) {
  const body = req.body || {};
  const academyIdStr = String(body.academyId || '').trim();
  const teamId = String(body.teamId || '').trim();
  const membershipId = String(body.membershipId || '').trim();

  if (!academyIdStr || !teamId || !membershipId) {
    return json(res, 400, { erro: 'academyId, teamId e membershipId obrigatórios' });
  }

  const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
  if (String(academyDoc?.teamId || '').trim() !== teamId) {
    return json(res, 403, { erro: 'teamId não pertence a esta academia' });
  }

  const membership = await getMembership(teamId, membershipId);
  if (!membership) return json(res, 404, { erro: 'Membro não encontrado' });

  try {
    await assertCanManageTarget(sessionUser, academyDoc, membership);
  } catch (e) {
    if (e.code === 'FORBIDDEN') {
      return json(res, 403, { erro: 'Sem permissão' });
    }
    throw e;
  }

  if (String(membership.userId || '') === String(sessionUser.$id)) {
    return json(res, 403, { erro: 'Use a página de segurança da sua conta para alterar sua senha' });
  }

  const email = String(membership.userEmail || membership.email || '').trim().toLowerCase();
  if (!email) {
    return json(res, 400, { erro: 'E-mail do membro não disponível' });
  }

  const recoveryUrl = inviteUrl();
  try {
    const userClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID);
    const account = new Account(userClient);
    await account.createRecovery(email, recoveryUrl);
  } catch (recoveryErr) {
    const recoveryRes = await fetch(`${ENDPOINT}/account/recovery`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Appwrite-Project': PROJECT_ID,
      },
      body: JSON.stringify({ email, url: recoveryUrl }),
    });
    if (!recoveryRes.ok) {
      const body = await recoveryRes.json().catch(() => ({}));
      throw new Error(body?.message || recoveryErr?.message || 'Falha ao enviar e-mail de recuperação');
    }
  }

  const targetName = String(membership.userName || membership.name || email).trim();

  await recordAcademyEvent({
    event_type: TEAM_EVENT_TYPES.PASSWORD_RESET,
    academy_id: academyIdStr,
    actor_user_id: sessionUser.$id,
    actor_name: actorName(sessionUser),
    target_user_id: String(membership.userId || '').trim(),
    target_name: targetName,
    timestamp: new Date().toISOString(),
  });

  return json(res, 200, { sucesso: true, email });
}
