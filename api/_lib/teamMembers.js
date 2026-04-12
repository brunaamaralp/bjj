import { Client, Users, Teams, ID, Databases } from 'node-appwrite';
import { getAppwriteUserFromJwt, assertAcademyOwnedByOwner } from '../../lib/server/authAppwrite.js';

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
    return res.status(500).json({ erro: 'Configuração Appwrite ausente' });
  }

  try {
    const auth = String(req.headers.authorization || '');
    if (!auth.toLowerCase().startsWith('bearer ')) {
      return res.status(401).json({ erro: 'JWT ausente' });
    }
    const jwt = auth.slice(7).trim();
    if (!jwt) return res.status(401).json({ erro: 'JWT inválido' });

    // Validar quem está chamando (precisa ser o dono da academia)
    const user = await getAppwriteUserFromJwt(jwt);
    if (!user) return res.status(401).json({ erro: 'Não autenticado' });

    const { name, email, password, teamId, academyId } = req.body;
    const academyIdStr = String(academyId || '').trim();

    if (!academyIdStr) return res.status(400).json({ erro: 'academyId obrigatório' });
    if (!teamId) return res.status(400).json({ erro: 'teamId obrigatório' });
    if (!email || !password || password.length < 8) {
      return res.status(400).json({ erro: 'Email e senha (mínimo 8 caracteres) são obrigatórios' });
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
      return res.status(403).json({ erro: 'teamId não pertence a esta academia' });
    }

    // 1. Criar o usuário no Auth
    let newUser;
    try {
        newUser = await users.create(
            ID.unique(),
            email,
            undefined, // phone
            password,
            name
        );
    } catch (e) {
        if (e.code === 409) {
            return res.status(409).json({ erro: 'Já existe um usuário com este e-mail' });
        }
        throw e;
    }

    // 2. Adicionar ao time (role: member)
    try {
        await teams.createMembership(
            teamId,
            ['member'],
            undefined, // email (podemos passar o userId)
            newUser.$id, // userId
            undefined, // phone
            'http://localhost:5173' // url redirect (fake/obrigatória no SDK)
        );
    } catch (e) {
        // Se der erro ao adicionar ao time, idealmente deletaríamos o usuário para não deixar lixo, mas como MVP apenas reportamos.
        console.error('Erro ao adicionar membro ao time:', e);
        return res.status(500).json({ erro: 'Usuário criado, mas erro ao associar ao time da academia' });
    }

    return res.status(200).json({ sucesso: true, memberId: newUser.$id });

  } catch (error) {
    console.error('[/api/team/members]', error);
    return res.status(500).json({ erro: error.message || 'Erro interno' });
  }
}
