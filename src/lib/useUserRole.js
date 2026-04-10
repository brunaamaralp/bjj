import { useLeadStore } from '../store/useLeadStore';

export function useUserRole(academy) {
  const userId = useLeadStore((s) => s.userId); // Current user ID stored in the leadStore or we can get it from somewhere
  
  if (!academy) return 'guest';
  if (academy.ownerId === userId) return 'owner';
  return 'member';
}
