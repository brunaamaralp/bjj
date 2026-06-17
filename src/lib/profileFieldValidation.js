import { isValidCPF } from './validations.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateProfileEmail(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (!EMAIL_RE.test(trimmed)) return 'E-mail inválido.';
  return null;
}

export function validateProfilePhone(value, { required = false } = {}) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return required ? 'Informe o telefone.' : null;
  if (digits.length < 10) return 'Telefone inválido — mínimo 10 dígitos.';
  return null;
}

export function validateProfileName(value) {
  if (!String(value || '').trim()) return 'Informe o nome.';
  return null;
}

export function validateProfileCpf(value, { required = false } = {}) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return required ? 'Informe o CPF.' : null;
  if (!isValidCPF(digits)) return 'CPF inválido.';
  return null;
}

export function validateProfileDueDay(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const n = Number(raw.replace(/[^\d]/g, ''));
  if (!Number.isFinite(n) || n < 1 || n > 31) return 'Informe um dia entre 1 e 31.';
  return null;
}
