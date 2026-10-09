// lib/professorClosing.js
import { LESSON_STATUS_CONFIRMED, normalizeLessonStatus, parseLessonInstructors } from './lessonStaffRegister.js';

export const CLOSING_STATUS_OPEN = 'aberto';
export const CLOSING_STATUS_PAID = 'pago';

export function countLessonsForStaff(slots = [], staffRef) {
  const ref = String(staffRef || '').trim();
  if (!ref) return 0;
  let n = 0;
  for (const slot of slots || []) {
    if (normalizeLessonStatus(slot?.lesson_status) !== LESSON_STATUS_CONFIRMED) continue;
    const professorId = String(slot.professor_user_id || '').trim();
    const instructorIds = parseLessonInstructors(slot).map((e) => e.id);
    const hit = professorId === ref || instructorIds.includes(ref);
    if (hit) n += 1;
  }
  return n;
}

export function buildClosingAmounts({
  lessonCount = 0,
  experimentalCount = 0,
  productDebits = [],
  rates = {},
} = {}) {
  const lessonRate = Math.max(0, Number(rates.lesson_amount) || 0);
  const expRate = Math.max(0, Number(rates.experimental_amount) || 0);
  const credits_lessons = Math.round(lessonCount * lessonRate * 100) / 100;
  const credits_experimental = Math.round(experimentalCount * expRate * 100) / 100;
  const debits_products =
    Math.round(
      (productDebits || []).reduce((s, v) => s + (Number(v) || 0), 0) * 100
    ) / 100;
  const net =
    Math.round((credits_lessons + credits_experimental - debits_products) * 100) / 100;
  return { credits_lessons, credits_experimental, debits_products, net };
}

export function financeExpenseAmountFromNet(net) {
  const n = Number(net);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * 100) / 100;
}

export function buildPaidSnapshot({ counts, amounts, rates, discountPct }) {
  return {
    status: CLOSING_STATUS_PAID,
    counts: { ...counts },
    amounts: { ...amounts },
    rates_snapshot: { ...rates, product_discount_pct: discountPct },
  };
}
