import { getAcademyDocument } from './getAcademyDocument.js';

export function academyEmailFromList(academyList, academyId) {
  const id = String(academyId || '').trim();
  if (!id) return '';
  const row = (academyList || []).find((a) => String(a.id) === id);
  return String(row?.email || '').trim();
}

/**
 * E-mail de contato da academia: lista em memória (bootstrap) ou documento Appwrite.
 */
export async function resolveAcademyContactEmail(academyId, academyList) {
  const fromList = academyEmailFromList(academyList, academyId);
  if (fromList) return fromList;

  const id = String(academyId || '').trim();
  if (!id) return '';

  try {
    const doc = await getAcademyDocument(id);
    return String(doc?.email || '').trim();
  } catch {
    return '';
  }
}

export function patchAcademyEmailInList(academyList, academyId, email) {
  const id = String(academyId || '').trim();
  const nextEmail = String(email || '').trim();
  return (academyList || []).map((a) =>
    String(a.id) === id ? { ...a, email: nextEmail } : a
  );
}
