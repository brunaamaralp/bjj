/**
 * Cache curto de roster de alunos por academia (reduz paginação repetida no Appwrite).
 */
import { listAcademyStudentsMapped } from './listAcademyStudents.js';

const STUDENTS_CACHE_MS = Number(process.env.ACADEMY_STUDENTS_CACHE_MS || 30_000);

/** @type {Map<string, { data: object[], expiresAt: number }>} */
const cache = new Map();

export function invalidateAcademyStudentsCache(academyId) {
  const id = String(academyId || '').trim();
  if (!id) {
    cache.clear();
    return;
  }
  cache.delete(id);
}

export async function listAcademyStudentsMappedCached(academyId) {
  const id = String(academyId || '').trim();
  if (!id) return [];

  const hit = cache.get(id);
  if (hit && Date.now() <= hit.expiresAt) return hit.data;

  const data = await listAcademyStudentsMapped(id);
  cache.set(id, { data, expiresAt: Date.now() + STUDENTS_CACHE_MS });
  return data;
}
