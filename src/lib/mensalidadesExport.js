import { downloadCsv } from './reportsExport.js';
import {
  expectedAmountForStudent,
  formatDueDayLabel,
  receivedAmountForPayment,
  resolveGridDisplayStatus,
} from './paymentStatus.js';
import { studentDueDay } from './collectionOverdue.js';

export function studentTurma(student) {
  return String(
    student?.turma || student?.className || student?.class_name || student?.classId || ''
  ).trim();
}

export function buildMensalidadesGridRows(students, paymentMap, financeConfig, currentMonth) {
  return (students || []).map((student) => {
    const payment = paymentMap[student.id];
    const expected = expectedAmountForStudent(student, financeConfig, payment);
    const display = resolveGridDisplayStatus(student, payment, currentMonth, new Date(), financeConfig);
    return {
      student,
      payment,
      expected,
      display,
      received: receivedAmountForPayment(payment),
      note: String(payment?.note || '').trim(),
    };
  });
}

export function filterSortMensalidadesRows(
  rows,
  { search = '', filter = 'all', turmaFilter = 'all', sortBy = 'name' } = {}
) {
  const q = String(search || '').trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (filter !== 'all' && row.display.key !== filter) return false;
    if (turmaFilter !== 'all' && studentTurma(row.student) !== turmaFilter) return false;
    if (q && !String(row.student.name || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const copy = [...filtered];
  copy.sort((a, b) => {
    if (sortBy === 'due') {
      const ad = studentDueDay(a.student) ?? 99;
      const bd = studentDueDay(b.student) ?? 99;
      return ad - bd;
    }
    if (sortBy === 'status') {
      return a.display.key.localeCompare(b.display.key, 'pt-BR');
    }
    if (sortBy === 'amount') {
      return (b.expected || 0) - (a.expected || 0);
    }
    return String(a.student.name || '').localeCompare(String(b.student.name || ''), 'pt-BR');
  });
  return copy;
}

function formatAmountBr(n) {
  const num = Number(n);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(2).replace('.', ',');
}

function planOrAccount(row) {
  const { student, payment } = row;
  const plan = String(student.plan || payment?.plan_name || '').trim();
  const account = String(student.preferredPaymentAccount || payment?.account || '').trim();
  if (plan && account) return `${plan} / ${account}`;
  return plan || account || '';
}

export function mensalidadesGridToCsvRows(sortedRows) {
  return sortedRows.map((row) => ({
    aluno: row.student.name || '',
    turma: studentTurma(row.student),
    status: row.display?.label || '',
    valor_esperado: formatAmountBr(row.expected),
    valor_recebido: formatAmountBr(row.received),
    vencimento: formatDueDayLabel(row.student) || '',
    plano_conta: planOrAccount(row),
    observacao: row.note || '',
  }));
}

export function exportMensalidadesGridCsv(sortedRows, currentMonth) {
  const csvRows = mensalidadesGridToCsvRows(sortedRows);
  const slug = String(currentMonth || 'mes').replace(/[^\d-]/g, '') || 'mes';
  if (!csvRows.length) {
    downloadCsv([{ mensagem: 'Nenhum aluno na grade com os filtros atuais' }], `mensalidades-${slug}-vazio.csv`);
    return 0;
  }
  downloadCsv(csvRows, `mensalidades-${slug}.csv`);
  return csvRows.length;
}
