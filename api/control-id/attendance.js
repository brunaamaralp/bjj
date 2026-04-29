import { Client, Databases, Query, ID } from 'node-appwrite';
import { ensureAuth, ensureAcademyAccess } from '../../lib/server/academyAccess.js';

const ENDPOINT =
  process.env.APPWRITE_ENDPOINT || process.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
const PROJECT_ID =
  process.env.APPWRITE_PROJECT_ID || process.env.VITE_APPWRITE_PROJECT || process.env.VITE_APPWRITE_PROJECT_ID || '';
const API_KEY = process.env.APPWRITE_API_KEY || '';
const DB_ID =
  process.env.APPWRITE_DATABASE_ID || process.env.DB_ID || process.env.VITE_APPWRITE_DATABASE_ID || '';

// Crie esta collection no Appwrite e adicione o ID no .env
const ATTENDANCE_COL = process.env.APPWRITE_ATTENDANCE_COLLECTION_ID || '';
const LEADS_COL =
  process.env.APPWRITE_LEADS_COLLECTION_ID || process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || '';

const adminClient = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
const databases = new Databases(adminClient);

function json(res, status, obj) {
  return res.status(status).json(obj);
}

export default async function handler(req, res) {
  const user = await ensureAuth(req, res);
  if (!user) return;

  const academy = await ensureAcademyAccess(req, res, user);
  if (!academy) return;
  const { academyId } = academy;

  if (req.method === 'GET') return handleGet(req, res, academyId);
  if (req.method === 'POST') return handlePost(req, res, academyId);

  return json(res, 405, { sucesso: false, erro: 'Método não permitido' });
}

// GET /api/control-id/attendance?student_id=...&start=2024-01-01&end=2024-01-31
async function handleGet(req, res, academyId) {
  const { student_id, start, end } = req.query;

  const filters = [
    Query.equal('academy_id', academyId),
    Query.orderDesc('checked_in_at'),
    Query.limit(500),
  ];
  if (student_id) filters.push(Query.equal('student_id', student_id));
  if (start) filters.push(Query.greaterThanEqual('checked_in_at', start));
  if (end) filters.push(Query.lessThanEqual('checked_in_at', end));

  try {
    const result = await databases.listDocuments(DB_ID, ATTENDANCE_COL, filters);
    return res.json({ sucesso: true, records: result.documents });
  } catch (err) {
    console.error('[attendance GET]', err);
    return json(res, 500, { sucesso: false, erro: err.message });
  }
}

// POST /api/control-id/attendance
// Body: { logs: [{ id, time, user_id, portal_id, event }] }
async function handlePost(req, res, academyId) {
  const { logs } = req.body || {};
  if (!Array.isArray(logs) || logs.length === 0) {
    return json(res, 400, { sucesso: false, erro: 'logs deve ser um array não vazio' });
  }
  if (!ATTENDANCE_COL) {
    return json(res, 500, { sucesso: false, erro: 'APPWRITE_ATTENDANCE_COLLECTION_ID não configurado' });
  }

  // Busca alunos desta academia que já foram sincronizados com o equipamento (têm device_id)
  let students = [];
  try {
    const result = await databases.listDocuments(DB_ID, LEADS_COL, [
      Query.equal('academy_id', academyId),
      Query.isNotNull('device_id'),
      Query.limit(1000),
    ]);
    students = result.documents;
  } catch (err) {
    console.error('[attendance POST] erro ao buscar alunos:', err);
    return json(res, 500, { sucesso: false, erro: 'Erro ao buscar alunos' });
  }

  // Índice: device_id (string) → documento do aluno
  const byDeviceId = Object.fromEntries(students.map(s => [String(s.device_id), s]));

  let count = 0;
  const errors = [];

  for (const log of logs) {
    const student = byDeviceId[String(log.user_id)];
    if (!student) continue; // usuário do equipamento não está cadastrado no sistema

    try {
      // Evita duplicatas: cada log do equipamento tem ID único
      const existing = await databases.listDocuments(DB_ID, ATTENDANCE_COL, [
        Query.equal('academy_id', academyId),
        Query.equal('device_log_id', String(log.id)),
        Query.limit(1),
      ]);
      if (existing.total > 0) continue;

      await databases.createDocument(DB_ID, ATTENDANCE_COL, ID.unique(), {
        academy_id: academyId,
        student_id: student.$id,
        student_name: student.name,
        device_log_id: String(log.id),
        device_user_id: String(log.user_id),
        // log.time é unix timestamp em segundos
        checked_in_at: new Date(log.time * 1000).toISOString(),
        portal_id: log.portal_id ? String(log.portal_id) : null,
        event_type: log.event ?? null,
      });
      count++;
    } catch (err) {
      errors.push({ logId: log.id, err: err.message });
    }
  }

  if (errors.length > 0) {
    console.warn('[attendance POST] erros parciais:', errors);
  }

  return res.json({ sucesso: true, count, errors: errors.length > 0 ? errors : undefined });
}
