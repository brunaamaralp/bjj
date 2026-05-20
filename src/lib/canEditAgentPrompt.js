import { useLeadStore } from '../store/useLeadStore.js';

export function canEditAgentPrompt(userId, academyDoc, membership = null) {
  if (!academyDoc || !userId) return false;
  if (String(academyDoc.ownerId || '').trim() === String(userId || '').trim()) return true;
  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  return roles.includes('admin') || roles.includes('owner');
}

export function canViewAgentSettings(role) {
  return role === 'owner' || role === 'member';
}

export function useCanEditAgentPrompt(membership = null) {
  const userId = useLeadStore((s) => s.userId);
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const academyDoc = (academyList || []).find((a) => a.id === academyId) || null;
  return canEditAgentPrompt(userId, academyDoc, membership);
}
