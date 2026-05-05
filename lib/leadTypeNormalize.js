/**
 * Unifica perfil infantil: valor legado "Kids" equivale a "Criança".
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeLeadProfileType(raw) {
  const t = String(raw ?? '').trim();
  if (t === 'Kids' || t.toLowerCase() === 'kids') return 'Criança';
  return t;
}

/** @param {unknown} raw */
export function isCriancaProfileType(raw) {
  return normalizeLeadProfileType(raw) === 'Criança';
}
