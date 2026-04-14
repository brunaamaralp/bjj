import { Client, Users, Teams, ID, Databases } from 'node-appwrite';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from './authAppwrite.js';

const ENDPOINT = process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID || process.env.APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID = process.env.VITE_APPWRITE_DATABASE_ID || process.env.APPWRITE_DATABASE_ID || '';
const ACADEMIES_COL =
  process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID || process.env.APPWRITE_ACADEMIES_COLLECTION_ID || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ erro: 'Method Not Allowed' });
  }

  if (!PROJECT_ID || !API_KEY || !DB_ID || !ACADEMIES_COL) {
    return res.status(500).json({ erro: 'Configura\u00e7\u00e3o Appwrite ausente' });
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

    if (!academyIdStr) return res.status(400).json({ erro: 'academyId obrigat\u00f3rio' });
    if (!teamId) return res.status(400).json({ erro: 'teamId obrigat\u00f3rio' });
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
            name
        );
    } catch (e) {
        if (e.code === 409) {
            return res.status(409).json({ erro: 'J\u00e1 existe um usu\u00e1rio com este e-mail' });
        }
        throw e;
    }

    try {
        await teams.createMembership(
            teamId,
            ['member'],
            undefined,
            newUser.$id,
            undefined,
            'http://localhost:5173'
        );
    } catch (e) {
        console.error('Erro ao adicionar membro ao time:', e);
        return res.status(500).json({ erro: 'Usu\u00e1rio criado, mas erro ao associar ao time da academia' });
    }

    return res.status(200).json({ sucesso: true, memberId: newUser.$id });

  } catch (error) {
    console.error('[/api/team/members]', error);
    return res.status(500).json({ erro: error.message || 'Erro interno' });
  }
}
