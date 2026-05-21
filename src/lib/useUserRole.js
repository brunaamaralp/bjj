import { useLeadStore } from '../store/useLeadStore';

/**
 * Papel na academia: owner | admin | member (recepcionista) | guest
 * @param {object} academy
 * @param {{ roles?: string[] } | null} [membership] — membership Appwrite do usuário atual no time
 */
export function useUserRole(academy, membership = null) {
  const userId = useLeadStore((s) => s.userId);

  if (!academy) return 'guest';
  if (String(academy.ownerId || '') === String(userId || '')) return 'owner';

  const roles = Array.isArray(membership?.roles) ? membership.roles : [];
  if (roles.includes('admin') || roles.includes('owner')) return 'admin';

  return 'member';
}
