import { downloadCsv } from './reportsExport.js';
import {
  expectedAmountForStudent,
  receivedAmountForPayment,
  resolveGridDisplayStatus,
} from './paymentStatus.js';
import { formatMensalidadeDueDateBr, studentDueDay } from './collectionOverdue.js';
import {
  matchesMensalidadesStatusFilter,
  matchesMensalidadesStudentFilters,
  studentTurma,
} from './mensalidadesFilters.js';
import { resolveStudentPayerDisplayName } from './studentPayerAliases.js';

export { studentTurma };

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
  {
    search = '',
    filter = 'all',
    turmaFilter = 'all',
    planFilter = 'all',
    sortBy = 'name',
    currentMonth = '',
    financeConfig = null,
    studentOverdueMeta = {},
  } = {}
) {
  const filtered = rows.filter((row) => {
    if (
      !matchesMensalidadesStatusFilter({
        filter,
        statusKey: row.display?.key,
        student: row.student,
        payment: row.payment,
        currentMonth,
        financeConfig,
        studentOverdueMeta,
      })
    ) {
      return false;
    }
    return matchesMensalidadesStudentFilters({
      student: row.student,
      search,
      turmaFilter,
      planFilter,
    });
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

export function mensalidadesGridToCsvRows(sortedRows, currentMonth = '', financeConfig = null) {
  return sortedRows.map((row) => ({
    aluno: row.student.name || '',
    pagador: resolveStudentPayerDisplayName(row.student),
    turma: studentTurma(row.student),
    status: row.display?.label || '',
    valor_esperado: formatAmountBr(row.expected),
    valor_recebido: formatAmountBr(row.received),
    vencimento: formatMensalidadeDueDateBr(row.student, row.payment, currentMonth, new Date(), financeConfig),
    plano_conta: planOrAccount(row),
    observacao: row.note || '',
  }));
}

export function exportMensalidadesGridCsv(sortedRows, currentMonth, financeConfig = null) {
  const csvRows = mensalidadesGridToCsvRows(sortedRows, currentMonth, financeConfig);
  const slug = String(currentMonth || 'mes').replace(/[^\d-]/g, '') || 'mes';
  if (!csvRows.length) {
    downloadCsv([{ mensagem: 'Nenhum aluno na grade com os filtros atuais' }], `mensalidades-${slug}-vazio.csv`);
    return 0;
  }
  downloadCsv(csvRows, `mensalidades-${slug}.csv`);
  return csvRows.length;
}
