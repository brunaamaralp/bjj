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
