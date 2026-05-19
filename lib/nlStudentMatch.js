/**
 * Sugestões de alunos/leads por nome (comandos NL).
 */

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokens(s) {
  const n = norm(s);
  return n ? n.split(/\s+/).filter(Boolean) : [];
}

function scoreName(query, name) {
  const q = norm(query);
  const n = norm(name);
  if (!q || !n) return 0;
  if (n === q) return 100;
  if (n.includes(q) || q.includes(n)) return 88;

  const qTok = tokens(query);
  const nTok = tokens(name);
  if (!qTok.length || !nTok.length) return 0;

  let hits = 0;
  for (const t of qTok) {
    if (nTok.some((nt) => nt.startsWith(t) || t.startsWith(nt))) hits += 1;
  }
  return Math.round((hits / qTok.length) * 75);
}

/**
 * @param {string} query
 * @param {{ id: string, name: string }[]} people
 * @param {number} [limit]
 */
export function suggestStudentsByName(query, people, limit = 5) {
  const q = String(query || '').trim();
  if (!q) return [];
  const ranked = (people || [])
    .filter((p) => p && String(p.id || '').trim() && String(p.name || '').trim())
    .map((p) => ({ ...p, score: scoreName(q, p.name) }))
    .filter((x) => x.score >= 35)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked.map((p) => ({
    id: String(p.id).trim(),
    name: String(p.name).trim(),
    score: p.score,
  }));
}
