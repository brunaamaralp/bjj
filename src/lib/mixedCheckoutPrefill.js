/** Prefill do checkout misto a partir do perfil do aluno. */
export const MIXED_CHECKOUT_PREFILL_KEY = 'nave:mixed-checkout-prefill:v1';

export function writeMixedCheckoutPrefill(student) {
  if (!student?.id || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      MIXED_CHECKOUT_PREFILL_KEY,
      JSON.stringify({
        aluno_id: student.id,
        aluno_nome: String(student.name || student.nome || '').trim(),
        phone: String(student.phone || student.telefone || '').trim(),
        plan: String(student.plan || '').trim(),
        plan_price: student.plan_price ?? null,
      })
    );
  } catch {
    /* ignore quota */
  }
}

export function consumeMixedCheckoutPrefill() {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(MIXED_CHECKOUT_PREFILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(MIXED_CHECKOUT_PREFILL_KEY);
    const parsed = JSON.parse(raw);
    if (!parsed?.aluno_id) return null;
    return parsed;
  } catch {
    return null;
  }
}
