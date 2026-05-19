/**
 * Valores esperados e alertas para register_payment (NL).
 */

export function expectedPlanAmount(student, financePlans) {
  const planName = String(student?.plan || '').trim();
  const plans = Array.isArray(financePlans) ? financePlans : [];
  const match = plans.find((p) => String(p?.name || '').trim() === planName);
  const price = Number(match?.price);
  if (Number.isFinite(price) && price > 0) return price;
  return 0;
}

/**
 * @param {object} parsed — resposta NL com data
 * @param {{ plan?: string }|null} student
 * @param {object[]} financePlans
 * @param {object[]} recentPayments
 */
export function enrichRegisterPayment(parsed, student, financePlans, recentPayments) {
  const data = { ...(parsed.data || {}) };
  const warnings = Array.isArray(parsed.warnings) ? [...parsed.warnings] : [];
  let refMonth = String(data.reference_month || '').trim();
  const studentId = String(data.student_id || '').trim();

  const expected = expectedPlanAmount(student, financePlans);
  if (expected > 0) {
    data.expected_amount = expected;
    if (data.amount == null || data.amount === '' || Number(data.amount) === 0) {
      data.amount = expected;
    }
  }

  const mentioned = data.amount != null && data.amount !== '' ? Number(data.amount) : null;
  if (expected > 0 && Number.isFinite(mentioned) && mentioned > 0 && Math.abs(mentioned - expected) > 0.009) {
    warnings.push(
      `O plano de ${data.student_name || 'o aluno'} é R$ ${expected.toFixed(2).replace('.', ',')}, mas você mencionou R$ ${mentioned.toFixed(2).replace('.', ',')}. Confirmar com valor diferente?`
    );
  }

  if (!refMonth) {
    const now = new Date();
    refMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    data.reference_month = refMonth;
    warnings.push(`Mês não mencionado — usando referência ${refMonth}.`);
  }

  const dup = (recentPayments || []).find(
    (p) =>
      String(p.lead_id || p.student_id || '').trim() === studentId &&
      String(p.reference_month || '').trim() === refMonth &&
      ['paid', 'partial', 'awaiting'].includes(String(p.status || '').toLowerCase())
  );
  if (dup) {
    data.existing_payment_id = String(dup.id || '').trim();
    warnings.push(
      `${data.student_name || 'Este aluno'} já tem pagamento registrado em ${refMonth}. Ao confirmar, o registro será atualizado.`
    );
  }

  if (!data.plan_name && student?.plan) {
    data.plan_name = String(student.plan).trim();
  }

  return { ...parsed, data, warnings };
}
