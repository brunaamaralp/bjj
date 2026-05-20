import { ID, Storage } from 'appwrite';
import { client, DB_ID, STUDENTS_COL, APPWRITE_PROJECT, ENDPOINT } from './appwrite';
import { databases } from './appwrite';

const BUCKET_ID = String(import.meta.env.VITE_APPWRITE_STUDENT_PHOTOS_BUCKET_ID || '').trim();

/**
 * Envia foto do aluno para Appwrite Storage (se bucket configurado).
 * @returns {Promise<string|null>} URL pública ou null se bucket ausente
 */
export async function uploadStudentPhoto(leadId, file) {
  if (!BUCKET_ID || !leadId || !file) return null;
  const storage = new Storage(client);
  const created = await storage.createFile(BUCKET_ID, ID.unique(), file);
  const url = `${ENDPOINT}/storage/buckets/${BUCKET_ID}/files/${created.$id}/view?project=${APPWRITE_PROJECT}`;
  return url;
}

export async function saveStudentPhotoUrl(leadId, photoUrl) {
  if (!leadId || !photoUrl) return;
  if (!STUDENTS_COL) return;
  await databases.updateDocument(DB_ID, STUDENTS_COL, leadId, {
    photo_url: String(photoUrl).slice(0, 512),
  });
}

export function isStudentPhotoUploadConfigured() {
  return Boolean(BUCKET_ID);
}
