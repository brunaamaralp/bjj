/** Cálculo de inadimplência / dias de atraso (mensalidades). */

function startOfLocalDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function parseYmdLocal(ymd) {
  if (!ymd) return null;
  const s = String(ymd).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return new Date(`${iso[1]}T12:00:00`);
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return new Date(`${br[3]}-${br[2]}-${br[1]}T12:00:00`);
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t;
}

export function studentDueDay(student) {
  const n = Number(student?.dueDay ?? student?.due_day);
  if (Number.isFinite(n) && n >= 1 && n <= 31) return Math.trunc(n);
  return null;
}

export function dueDateInMonth(currentMonth, dayOfMonth) {
  if (!dayOfMonth || !currentMonth) return null;
  const d = new Date(`${currentMonth}-${String(dayOfMonth).padStart(2, '0')}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {{ status: 'paid'|'pending'|'soon'|'none', dueDate: Date|null, paidAt: Date|null, daysOverdue: number }}
 */
export function getPaymentRowStatus(student, payment, currentMonth, today = new Date()) {
  const today0 = startOfLocalDay(today);
  const dbStatus = String(payment?.status || '').toLowerCase();

  if (payment && dbStatus === 'paid') {
    const paidAt = payment.paid_at ? parseYmdLocal(String(payment.paid_at).slice(0, 10)) : null;
    return { status: 'paid', dueDate: null, paidAt, daysOverdue: 0 };
  }

  if (payment && dbStatus === 'awaiting') {
    const dueDate =
      payment.due_date ? parseYmdLocal(String(payment.due_date).slice(0, 10)) : dueDateInMonth(currentMonth, studentDueDay(student));
    return { status: 'soon', dueDate: dueDate || null, paidAt: null, daysOverdue: 0 };
  }

  if (payment && dbStatus === 'partial') {
    const dueDate =
      payment.due_date ? parseYmdLocal(String(payment.due_date).slice(0, 10)) : dueDateInMonth(currentMonth, studentDueDay(student));
    let daysOverdue = 0;
    if (dueDate) {
      const due0 = startOfLocalDay(dueDate);
      if (due0 < today0) daysOverdue = Math.floor((today0 - due0) / 86400000);
    }
    return {
      status: daysOverdue > 0 ? 'pending' : 'soon',
      dueDate: dueDate || null,
      paidAt: null,
      daysOverdue,
    };
  }

  let dueDate = null;

  if (payment && String(payment.status || '').toLowerCase() === 'pending') {
    dueDate = payment.due_date ? parseYmdLocal(String(payment.due_date).slice(0, 10)) : null;
    if (dueDate) {
      const due0 = startOfLocalDay(dueDate);
      if (due0 < today0) {
        const daysOverdue = Math.floor((today0 - due0) / 86400000);
        return { status: 'pending', dueDate, paidAt: null, daysOverdue };
      }
      const daysUntil = Math.ceil((due0 - today0) / 86400000);
      if (daysUntil >= 0 && daysUntil <= 7) {
        return { status: 'soon', dueDate, paidAt: null, daysOverdue: 0 };
      }
      return { status: 'none', dueDate, paidAt: null, daysOverdue: 0 };
    }
  }

  const day = studentDueDay(student);
  const defaultDue = dueDateInMonth(currentMonth, day);
  if (defaultDue) {
    const due0 = startOfLocalDay(defaultDue);
    if (due0 < today0) {
      const daysOverdue = Math.floor((today0 - due0) / 86400000);
      return { status: 'pending', dueDate: defaultDue, paidAt: null, daysOverdue };
    }
    const daysUntil = Math.ceil((due0 - today0) / 86400000);
    if (daysUntil >= 0 && daysUntil <= 7) {
      return { status: 'soon', dueDate: defaultDue, paidAt: null, daysOverdue: 0 };
    }
  }
  return { status: 'none', dueDate: defaultDue || null, paidAt: null, daysOverdue: 0 };
}

export function isOverdueForCollection(student, payment, currentMonth, minDays = 1, today = new Date()) {
  const row = getPaymentRowStatus(student, payment, currentMonth, today);
  return row.status === 'pending' && row.daysOverdue >= minDays;
}

export function openAmountForStudent(student, payment, financeConfig) {
  const payAmt = Number(payment?.amount);
  if (Number.isFinite(payAmt) && payAmt > 0) return payAmt;
  const planName = String(student?.plan || payment?.plan_name || '').trim();
  const plans = financeConfig?.plans || [];
  const match = (plans || []).find((p) => String(p?.name || '').trim() === planName);
  const price = Number(match?.price);
  if (Number.isFinite(price) && price > 0) return price;
  return 0;
}
