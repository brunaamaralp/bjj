import { useUserRole } from './useUserRole.js';

/** Owner e admin podem editar cadastros no perfil. */
export function canEditProfileRole(role) {
  return role === 'owner' || role === 'admin';
}

export function useCanEditProfile(academy) {
  const role = useUserRole(academy);
  return canEditProfileRole(role);
}
