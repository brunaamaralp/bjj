import { Client, Databases } from 'node-appwrite';
import { API_KEY, DB_ID, ENDPOINT, PROJECT_ID } from '../server/appwriteCollections.js';

const LEADS_COL = () =>
  String(
    process.env.APPWRITE_LEADS_COLLECTION_ID || process.env.VITE_APPWRITE_LEADS_COLLECTION_ID || ''
  ).trim();
const STUDENTS_COL = () =>
  String(
    process.env.APPWRITE_STUDENTS_COLLECTION_ID || process.env.VITE_APPWRITE_STUDENTS_COLLECTION_ID || ''
  ).trim();

let cachedDb = null;

function getDb() {
  if (!PROJECT_ID || !API_KEY || !DB_ID) return null;
  if (!cachedDb) {
    cachedDb = new Databases(
      new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY)
    );
  }
  return cachedDb;
}

function normalizeStudentStatus(raw) {
  const s = String(raw || '').trim().toLowerCase();
  return s === 'inactive' ? 'inactive' : 'active';
}

/** Aluno inativo (studentStatus) ou desligado do funil (status ≠ Matriculado). */
export function isOffboardedPersonDoc(doc) {
  if (!doc) return false;
  const studentStatus = normalizeStudentStatus(doc.studentStatus ?? doc.student_status);
  if (studentStatus === 'inactive') return true;
  const funnel = String(doc.status || '').trim();
  if (funnel && funnel !== 'Matriculado') return true;
  return false;
}

export async function fetchAcademyDoc(academyId) {
  const id = String(academyId || '').trim();
  if (!id) return null;
  const db = getDb();
  const col = String(
    process.env.APPWRITE_ACADEMIES_COLLECTION_ID ||
      process.env.VITE_APPWRITE_ACADEMIES_COLLECTION_ID ||
      ''
  ).trim();
  if (!db || !col) return null;
  try {
    return await db.getDocument(DB_ID, col, id);
  } catch {
    return null;
  }
}

export async function fetchLeadPersonForContract(leadId) {
  const id = String(leadId || '').trim();
  if (!id) return null;
  const db = getDb();
  if (!db) return null;

  const cols = [STUDENTS_COL(), LEADS_COL()].filter(Boolean);
  for (const col of cols) {
    try {
      const doc = await db.getDocument(DB_ID, col, id);
      return {
        doc,
        inactive: isOffboardedPersonDoc(doc),
        email: String(doc.email || doc.Email || '').trim(),
        name: String(doc.name || '').trim(),
        phone: String(doc.phone || '').trim(),
      };
    } catch {
      /* try next */
    }
  }
  return null;
}
