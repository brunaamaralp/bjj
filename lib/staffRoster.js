/**
 * Domínio puro — catálogo interno Professor/Instrutor (sem login).
 */

export const STAFF_ROLE_PROFESSOR = 'professor';
export const STAFF_ROLE_INSTRUCTOR = 'instructor';

export const STAFF_ROSTER_ROLE_LABELS = {
  [STAFF_ROLE_PROFESSOR]: 'Professor',
  [STAFF_ROLE_INSTRUCTOR]: 'Instrutor',
};

/**
 * @param {unknown} raw
 * @returns {'' | 'professor' | 'instructor'}
 */
export function normalizeStaffRosterRole(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (s === STAFF_ROLE_PROFESSOR || s === 'professora') return STAFF_ROLE_PROFESSOR;
  if (s === STAFF_ROLE_INSTRUCTOR || s === 'instrutor' || s === 'instrutora') {
    return STAFF_ROLE_INSTRUCTOR;
  }
  return '';
}

/** @param {unknown} role */
export function isRosterTeamRole(role) {
  return Boolean(normalizeStaffRosterRole(role));
}

/**
 * @param {{ name?: string, role?: string }} data
 */
export function validateStaffRosterForm(data = {}) {
  /** @type {Record<string, string>} */
  const errors = {};
  const name = String(data.name || '').trim();
  const role = normalizeStaffRosterRole(data.role);
  if (!name) errors.name = 'Informe o nome.';
  if (!role) errors.role = 'Selecione Professor ou Instrutor.';
  return { valid: Object.keys(errors).length === 0, errors };
}

/**
 * @param {object | null | undefined} doc
 */
export function mapStaffRosterDoc(doc) {
  if (!doc) return null;
  const id = String(doc.$id || doc.id || '').trim();
  if (!id) return null;
  return {
    id,
    academy_id: String(doc.academy_id || '').trim(),
    name: String(doc.name || '').trim(),
    role: normalizeStaffRosterRole(doc.role) || STAFF_ROLE_INSTRUCTOR,
    is_active: doc.is_active !== false,
    sort_order: Number(doc.sort_order) || 0,
  };
}

/**
 * @param {{ name?: string, role?: string, is_active?: boolean, sort_order?: number }} data
 * @param {string} academyId
 */
export function buildStaffRosterPayload(data, academyId) {
  const role = normalizeStaffRosterRole(data.role);
  return {
    academy_id: String(academyId || '').trim(),
    name: String(data.name || '').trim(),
    role: role || STAFF_ROLE_INSTRUCTOR,
    is_active: data.is_active !== false,
    sort_order: Number(data.sort_order) || 0,
  };
}

/**
 * @param {{ kind: 'login' | 'roster', id: string }} ref
 */
export function encodeStaffRef(ref) {
  const kind = ref?.kind === 'roster' ? 'roster' : 'login';
  const id = String(ref?.id || '').trim();
  if (!id) return '';
  return `${kind}:${id}`;
}

/**
 * @param {unknown} raw
 * @returns {{ kind: 'login' | 'roster', id: string }}
 */
export function decodeStaffRef(raw) {
  const s = String(raw || '').trim();
  if (!s) return { kind: 'login', id: '' };
  if (s.startsWith('roster:')) return { kind: 'roster', id: s.slice('roster:'.length) };
  if (s.startsWith('login:')) return { kind: 'login', id: s.slice('login:'.length) };
  return { kind: 'login', id: s };
}

/**
 * @param {{
 *   teamMembers?: { id: string, nome: string }[],
 *   roster?: { id: string, name: string, role?: string, is_active?: boolean }[],
 * }} input
 */
export function buildLessonStaffPickerOptions({ teamMembers = [], roster = [] } = {}) {
  /** @type {{ id: string, nome: string, source: string, role: string }[]} */
  const opts = [];
  for (const m of teamMembers || []) {
    const id = String(m?.id || '').trim();
    if (!id) continue;
    opts.push({
      id: encodeStaffRef({ kind: 'login', id }),
      nome: String(m.nome || m.name || id).trim() || id,
      source: 'login',
      role: 'login',
    });
  }
  for (const r of roster || []) {
    if (r?.is_active === false) continue;
    const id = String(r?.id || '').trim();
    if (!id) continue;
    const role = normalizeStaffRosterRole(r.role) || STAFF_ROLE_INSTRUCTOR;
    opts.push({
      id: encodeStaffRef({ kind: 'roster', id }),
      nome: String(r.name || id).trim() || id,
      source: 'roster',
      role,
    });
  }
  return opts.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
}
