/** Primeiro nome legível a partir do usuário Appwrite ou string. */
export function firstNameFromUser(user) {
  const raw = String(user?.name || user || '').trim();
  const first = raw.split(/\s+/).filter(Boolean)[0] || '';
  return first.slice(0, 80);
}
