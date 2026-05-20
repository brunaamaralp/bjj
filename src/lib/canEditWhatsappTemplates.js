import { useLeadStore } from '../store/useLeadStore.js';

/**
 * Titular ou admin do time Appwrite pode editar templates.
 * @param {string} userId
 * @param {{ ownerId?: string }} academyDoc
 * @param {{ roles?: string[] } | null} membership
 */
export function canEditWhatsappTemplates(userId, academyDoc, membership = null) {
  if (!academyDoc || !userId) return false;
  if (String(academyDoc.ownerId || '').trim() === String(userId || '').trim()) return true;
  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  return roles.includes('admin') || roles.includes('owner');
}

export function useCanEditWhatsappTemplates(membership = null) {
  const userId = useLeadStore((s) => s.userId);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = (academyList || []).find((a) => a.id === academyId) || null;
  return canEditWhatsappTemplates(userId, academyDoc, membership);
}
