import { Client, Users, Teams, ID, Databases } from 'node-appwrite';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from './authAppwrite.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

export default async function handler(req, res) {
  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return res.status(500).json({ erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
  }

  if (req.method === 'PATCH') {
    return handlePatchMemberName(req, res);
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }

  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return res.status(401).json({ erro: 'JWT inv\u00e1lido' });

    const user = await getAppwriteUserFromJwt(jwt);
    if (!user) return res.status(401).json({ erro: 'N\u00e3o autenticado' });

    const { name, email, password, teamId, academyId } = req.body;
    const academyIdStr = String(academyId || '').trim();
    const displayName = String(name || '').trim();

    if (!academyIdStr) return res.status(400).json({ erro: 'academyId obrigat\u00f3rio' });
    if (!teamId) return res.status(400).json({ erro: 'teamId obrigat\u00f3rio' });
    if (!displayName) {
      return res.status(400).json({ erro: 'Nome \u00e9 obrigat\u00f3rio' });
    }
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ erro: 'Email e senha (m\u00ednimo 8 caracteres) s\u00e3o obrigat\u00f3rios' });
    }

    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);
    const users = new Users(adminClient);
    const teams = new Teams(adminClient);

    try {
      await assertAcademyOwnedByOwner(databases, academyIdStr, user.$id);
    } catch (e) {
      if (e?.code === 'FORBIDDEN') {
        return res.status(403).json({ erro: 'Apenas o dono da academia pode convidar membros' });
      }
      throw e;
    }
    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
    if (String(academyDoc?.teamId || '').trim() !== String(teamId || '').trim()) {
      return res.status(403).json({ erro: 'teamId n\u00e3o pertence a esta academia' });
    }

    let newUser;
    try {
        newUser = await users.create(
            ID.unique(),
            email,
            undefined,
            password,
            displayName
        );
    } catch (e) {
        if (e.code === 409) {
            return res.status(409).json({ erro: 'J\u00e1 existe um usu\u00e1rio com este e-mail' });
        }
        throw e;
    }

    try {
        // Com API key do servidor o membro entra direto no time; não enviar `url` —
        // o Appwrite só aceita hosts cadastrados como plataforma (localhost:5173 costuma falhar em produção).
        await teams.createMembership({
            teamId,
            roles: ['member'],
            userId: newUser.$id,
            name: displayName,
        });
    } catch (e) {
        console.error('Erro ao adicionar membro ao time:', e);
        try {
            await users.delete(newUser.$id);
        } catch (delErr) {
            console.error('Falha ao remover usu\u00e1rio ap\u00f3s erro no time (verifique no Appwrite):', delErr);
        }
        return res.status(500).json({ erro: 'Erro ao associar o usu\u00e1rio ao time da academia. Tente novamente.' });
    }

    return res.status(200).json({
      sucesso: true,
      memberId: newUser.$id,
      displayName: displayName,
      memberEmail: String(email || '').trim(),
      roleLabel: 'Recepcionista',
    });

  } catch (error) {
    console.error('[/api/team/members]', error);
    return res.status(500).json({ erro: error.message || 'Erro interno' });
  }
}

/**
 * Dono da academia atualiza o nome (perfil Appwrite) de um membro do time — não pode ser role owner.
 */
async function handlePatchMemberName(req, res) {
  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return res.status(401).json({ erro: 'JWT inv\u00e1lido' });

    const sessionUser = await getAppwriteUserFromJwt(jwt);
    if (!sessionUser) return res.status(401).json({ erro: 'N\u00e3o autenticado' });

    const body = req.body || {};
    const academyIdStr = String(body.academyId || '').trim();
    const teamId = String(body.teamId || '').trim();
    const targetUserId = String(body.userId || '').trim();
    const displayName = String(body.name || '').trim();

    if (!academyIdStr) return res.status(400).json({ erro: 'academyId obrigat\u00f3rio' });
    if (!teamId) return res.status(400).json({ erro: 'teamId obrigat\u00f3rio' });
    if (!targetUserId) return res.status(400).json({ erro: 'userId obrigat\u00f3rio' });
    if (!displayName) return res.status(400).json({ erro: 'Nome \u00e9 obrigat\u00f3rio' });

    const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
    const databases = new Databases(adminClient);
    const users = new Users(adminClient);
    const teams = new Teams(adminClient);

    try {
      await assertAcademyOwnedByOwner(databases, academyIdStr, sessionUser.$id);
    } catch (e) {
      if (e?.code === 'FORBIDDEN') {
        return res.status(403).json({ erro: 'Apenas o dono da academia pode editar membros' });
      }
      throw e;
    }

    const academyDoc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyIdStr);
    if (String(academyDoc?.teamId || '').trim() !== teamId) {
      return res.status(403).json({ erro: 'teamId n\u00e3o pertence a esta academia' });
    }

    const list = await teams.listMemberships(teamId);
    const membership = (list.memberships || []).find((m) => String(m.userId || '').trim() === targetUserId);
    if (!membership) {
      return res.status(404).json({ erro: 'Membro n\u00e3o encontrado neste time' });
    }
    if ((membership.roles || []).includes('owner')) {
      return res.status(403).json({ erro: 'N\u00e3o \u00e9 poss\u00edvel alterar o nome do dono por aqui' });
    }

    await users.updateName({ userId: targetUserId, name: displayName });

    return res.status(200).json({ sucesso: true, displayName });
  } catch (error) {
    console.error('[/api/team/members PATCH]', error);
    return res.status(500).json({ erro: error.message || 'Erro interno' });
  }
}
