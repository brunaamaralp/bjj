import { describe, it, expect } from 'vitest';
import {
  buildMensalidadesGridRows,
  filterSortMensalidadesRows,
  mensalidadesGridToCsvRows,
  studentTurma,
} from '../lib/mensalidadesExport.js';

describe('mensalidadesExport', () => {
  const students = [
    { id: '1', name: 'Ana', turma: 'Adulto', plan: 'Mensal' },
    { id: '2', name: 'Bruno', className: 'Kids', plan: 'Trimestral' },
  ];
  const paymentMap = {
    1: { status: 'paid', amount: 300, paid_amount: 300, reference_month: '2026-06' },
  };
  const financeConfig = { plans: [{ name: 'Mensal', price: 300 }] };

  it('filters rows by turma', () => {
    const rows = buildMensalidadesGridRows(students, paymentMap, financeConfig, '2026-06');
    const filtered = filterSortMensalidadesRows(rows, { turmaFilter: 'Kids' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].student.name).toBe('Bruno');
  });

  it('exports status label in CSV row', () => {
    const rows = buildMensalidadesGridRows(students, paymentMap, financeConfig, '2026-06');
    const csv = mensalidadesGridToCsvRows(rows);
    const ana = csv.find((r) => r.aluno === 'Ana');
    expect(ana).toBeTruthy();
    expect(ana.status).toBeTruthy();
    expect(studentTurma(students[0])).toBe('Adulto');
  });
});
