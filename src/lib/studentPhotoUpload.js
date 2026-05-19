import { ID, Storage } from 'appwrite';
import { client, DB_ID, LEADS_COL } from './appwrite';
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
  const endpoint = import.meta.env.VITE_APPWRITE_ENDPOINT || 'https://sfo.cloud.appwrite.io/v1';
  const project = import.meta.env.VITE_APPWRITE_PROJECT_ID || import.meta.env.VITE_APPWRITE_PROJECT || '';
  const url = `${endpoint}/storage/buckets/${BUCKET_ID}/files/${created.$id}/view?project=${project}`;
  return url;
}

export async function saveStudentPhotoUrl(leadId, photoUrl) {
  if (!leadId || !photoUrl) return;
  await databases.updateDocument(DB_ID, LEADS_COL, leadId, {
    photo_url: String(photoUrl).slice(0, 512),
  });
}

export function isStudentPhotoUploadConfigured() {
  return Boolean(BUCKET_ID);
}
