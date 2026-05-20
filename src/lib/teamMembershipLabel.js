/** Rótulo legível para membership Appwrite (userName pode vir vazio por privacidade do time). */
export function membershipPrimaryLabel(m) {
  const name = String(m?.userName || m?.name || '').trim();
  if (name) return name;
  const email = String(m?.userEmail || m?.email || '').trim();
  if (email) return email;
  return 'Usuário';
}

export function membershipSecondaryEmail(m) {
  const name = String(m?.userName || m?.name || '').trim();
  const email = String(m?.userEmail || m?.email || '').trim();
  if (name && email) return email;
  return '';
}

/** Rótulo de papel exibido na aba Equipe (alinha com owner / admin / member do Appwrite). */
export function membershipRoleDisplayLabel(m, academyOwnerId) {
  const roles = Array.isArray(m?.roles) ? m.roles : [];
  const userId = String(m?.userId || '').trim();
  const ownerId = String(academyOwnerId || '').trim();
  if (roles.includes('owner') || (ownerId && userId && userId === ownerId)) {
    return 'Titular';
  }
  if (roles.includes('admin')) {
    return 'Administrador';
  }
  return 'Recepcionista';
}

export function membershipRolePillStyle(label) {
  if (label === 'Titular') {
    return { background: 'var(--accent-light)', color: 'var(--accent)' };
  }
  if (label === 'Administrador') {
    return { background: 'rgba(99, 102, 241, 0.12)', color: '#4f46e5' };
  }
  return { background: 'var(--surface-hover)', color: 'var(--text-secondary)' };
}
