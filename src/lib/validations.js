import { Query } from 'appwrite';
import { databases, DB_ID, STUDENTS_COL } from './appwrite';

/** Remove máscara e valida dígitos verificadores do CPF. */
export function isValidCPF(cpf) {
  const digits = String(cpf ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(digits[i], 10) * (10 - i);
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(digits[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(digits[i], 10) * (11 - i);
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  return remainder === parseInt(digits[10], 10);
}

/** Retorna documento duplicado na mesma academia ou null. */
export async function findDuplicateStudentCpf(academyId, cpfDigits, excludeStudentId = null) {
  const aid = String(academyId || '').trim();
  const cpf = String(cpfDigits || '').replace(/\D/g, '');
  if (!aid || cpf.length !== 11 || !STUDENTS_COL || !DB_ID) return null;

  try {
    const res = await databases.listDocuments(DB_ID, STUDENTS_COL, [
      Query.equal('academyId', aid),
      Query.equal('cpf', cpf),
      Query.limit(5),
    ]);
    const excludeId = String(excludeStudentId || '').trim();
    const match = (res.documents || []).find((d) => String(d.$id) !== excludeId);
    return match || null;
  } catch {
    return null;
  }
}

/** true se a data de pagamento (YYYY-MM-DD) for posterior ao fim do dia atual. */
export function isPaymentDateInFuture(paidAtYmd) {
  const raw = String(paidAtYmd || '').trim();
  if (!raw) return false;
  const paidAt = new Date(raw);
  if (Number.isNaN(paidAt.getTime())) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return paidAt > today;
}

export function formatPaymentDateLabel(paidAtYmd) {
  const raw = String(paidAtYmd || '').trim();
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('pt-BR');
}
