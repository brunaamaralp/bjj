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

  it('filters rows by paid_in_month including covered', () => {
    const paymentMapExtended = {
      ...paymentMap,
      2: { status: 'covered', amount: 300, reference_month: '2026-06' },
    };
    const rows = buildMensalidadesGridRows(students, paymentMapExtended, financeConfig, '2026-06');
    const filtered = filterSortMensalidadesRows(rows, { filter: 'paid_in_month' });
    expect(filtered.map((r) => r.student.name).sort()).toEqual(['Ana', 'Bruno']);
  });

  it('filters rows by plan', () => {
    const rows = buildMensalidadesGridRows(students, paymentMap, financeConfig, '2026-06');
    const filtered = filterSortMensalidadesRows(rows, { planFilter: 'Trimestral' });
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

  it('exports pagador after aluno using alias > responsavel > parentName', () => {
    const withPayer = [
      {
        id: '1',
        name: 'Ana',
        turma: 'Adulto',
        plan: 'Mensal',
        payerAliases: [{ display: 'Maria PIX', normalized: 'MARIA PIX', source: 'manual' }],
        responsavel: 'Ignorado',
      },
      {
        id: '2',
        name: 'Bruno',
        className: 'Kids',
        plan: 'Trimestral',
        responsavel: 'Pai Bruno',
      },
      {
        id: '3',
        name: 'Carla',
        plan: 'Mensal',
        parentName: 'Mae Carla',
      },
    ];
    const rows = buildMensalidadesGridRows(withPayer, paymentMap, financeConfig, '2026-06');
    const csv = mensalidadesGridToCsvRows(rows);
    expect(csv.find((r) => r.aluno === 'Ana').pagador).toBe('Maria PIX');
    expect(csv.find((r) => r.aluno === 'Bruno').pagador).toBe('Pai Bruno');
    expect(csv.find((r) => r.aluno === 'Carla').pagador).toBe('Mae Carla');
    const keys = Object.keys(csv[0]);
    expect(keys.indexOf('pagador')).toBe(keys.indexOf('aluno') + 1);
  });
});
