/**
 * Campos permitidos para atualização parcial de aluno via NL (update_student).
 * Chaves em camelCase, alinhadas a `useLeadStore.updateLead` / StudentProfile.
 */
const ALLOWED_STUDENT_PATCH_KEYS = new Set([
  'plan',
  'enrollmentDate',
  'birthDate',
  'cpf',
  'responsavel',
  'emergencyContact',
  'emergencyPhone',
  'preferredPaymentMethod',
  'preferredPaymentAccount',
  'name',
  'phone',
  'type',
  'parentName',
  'age',
  'belt',
  'origin'
]);

const STUDENT_TYPES = new Set(['Adulto', 'Criança', 'Juniores']);

const PAY_METHODS = new Set(['pix', 'dinheiro', 'cartão_débito', 'cartão_crédito', 'transferência']);

function clip(s, max) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  return t.length > max ? t.slice(0, max) : t;
}

function normalizePreferredMethod(m) {
  const raw = String(m || '').trim().toLowerCase();
  if (!raw) return '';
  const map = {
    pix: 'pix',
    dinheiro: 'dinheiro',
    'cartão débito': 'cartão_débito',
    'cartao débito': 'cartão_débito',
    'cartão debito': 'cartão_débito',
    'cartão crédito': 'cartão_crédito',
    'cartao crédito': 'cartão_crédito',
    transferência: 'transferência',
    transferencia: 'transferência'
  };
  if (map[raw]) return map[raw];
  if (PAY_METHODS.has(raw)) return raw;
  return clip(m, 64);
}

/** @param {string} ymd */
function isYmd(ymd) {
  const t = String(ymd || '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(t);
}

/**
 * Extrai e sanitiza campos permitidos a partir de `data` (pode trazer `updates` ou chaves flat).
 * @param {Record<string, unknown>} data
 * @returns {Record<string, string>}
 */
export function sanitizeStudentUpdatesForNl(data) {
  const src = data && typeof data === 'object' ? data : {};
  const rawUpdates =
    src.updates && typeof src.updates === 'object' && !Array.isArray(src.updates) ? { ...src.updates } : {};
  for (const k of ALLOWED_STUDENT_PATCH_KEYS) {
    if (Object.prototype.hasOwnProperty.call(src, k) && src[k] !== undefined && src[k] !== null) {
      rawUpdates[k] = src[k];
    }
  }

  /** @type {Record<string, string>} */
  const out = {};

  for (const key of ALLOWED_STUDENT_PATCH_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(rawUpdates, key)) continue;
    let v = rawUpdates[key];
    if (v === undefined || v === null) continue;

    if (key === 'cpf') {
      const digits = String(v).replace(/\D/g, '').slice(0, 14);
      out.cpf = digits;
      continue;
    }
    if (key === 'phone') {
      const digits = String(v).replace(/\D/g, '').slice(0, 15);
      if (digits.length > 0 && digits.length < 10) continue;
      out.phone = digits;
      continue;
    }
    if (key === 'birthDate' || key === 'enrollmentDate') {
      const s = String(v).trim().slice(0, 10);
      if (!isYmd(s)) continue;
      out[key] = s;
      continue;
    }
    if (key === 'type') {
      const t = String(v).trim();
      if (STUDENT_TYPES.has(t)) out.type = t;
      continue;
    }
    if (key === 'preferredPaymentMethod') {
      const n = normalizePreferredMethod(v);
      if (n) out.preferredPaymentMethod = n;
      continue;
    }
    if (key === 'preferredPaymentAccount') {
      out.preferredPaymentAccount = clip(v, 256);
      continue;
    }
    if (key === 'plan' || key === 'responsavel' || key === 'emergencyContact' || key === 'name' || key === 'origin') {
      const s = clip(v, 512);
      if (s !== '') out[key] = s;
      continue;
    }
    if (key === 'emergencyPhone') {
      const digits = String(v).replace(/\D/g, '').slice(0, 15);
      out.emergencyPhone = digits;
      continue;
    }
    if (key === 'parentName' || key === 'belt' || key === 'age') {
      const s = clip(v, 256);
      if (s !== '') out[key] = s;
    }
  }

  return out;
}

export { ALLOWED_STUDENT_PATCH_KEYS };
