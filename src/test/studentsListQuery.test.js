import { describe, expect, it } from 'vitest';
import {
  STUDENT_LIST_SELECT,
  buildStudentsListDocumentQueries,
  parseStudentsListQueryParams,
} from '../../lib/server/studentsListQuery.js';
import { STUDENT_STATUS } from '../lib/studentStatus.js';

describe('parseStudentsListQueryParams', () => {
  it('parseia filtros de listagem', () => {
    const opts = parseStudentsListQueryParams({
      search: 'Ana',
      plan: 'Mensal',
      turma: 'Kids',
      origin: 'WhatsApp',
      turma_empty: '1',
      student_status: STUDENT_STATUS.INACTIVE,
      cursor: 'doc123',
      limit: '50',
    });
    expect(opts).toMatchObject({
      search: 'Ana',
      plan: 'Mensal',
      turma: 'Kids',
      origin: 'WhatsApp',
      turmaEmpty: true,
      studentStatus: STUDENT_STATUS.INACTIVE,
      cursor: 'doc123',
      limit: 50,
    });
  });

  it('ignora busca curta', () => {
    const opts = parseStudentsListQueryParams({ search: 'A' });
    expect(opts.search).toBeUndefined();
  });
});

describe('buildStudentsListDocumentQueries', () => {
  it('inclui select e filtros principais', () => {
    const opts = parseStudentsListQueryParams({
      search: 'João',
      plan: 'Anual',
      origin: 'Indicação',
    });
    const queries = buildStudentsListDocumentQueries('acad1', opts, 'turma');
    const serialized = queries.map((q) => String(q));
    expect(serialized.some((q) => q.includes('select'))).toBe(true);
    expect(serialized.some((q) => q.includes('academyId'))).toBe(true);
    expect(serialized.some((q) => q.includes('contains'))).toBe(true);
    expect(serialized.some((q) => q.includes('source_origin'))).toBe(true);
    expect(STUDENT_LIST_SELECT).toContain('name');
    expect(STUDENT_LIST_SELECT).toContain('phone');
    expect(STUDENT_LIST_SELECT).toContain('converted_at');
    expect(STUDENT_LIST_SELECT).toContain('enrollmentDate');
    expect(STUDENT_LIST_SELECT).toContain('overdue');
    expect(STUDENT_LIST_SELECT).toContain('due_day');
    expect(STUDENT_LIST_SELECT).toContain('preferred_payment_method');
    expect(STUDENT_LIST_SELECT).not.toContain('origin');
    expect(STUDENT_LIST_SELECT).not.toContain('class_name');
  });

  it('permite omitir select para fallback do handler', () => {
    const opts = parseStudentsListQueryParams({});
    const withSelect = buildStudentsListDocumentQueries('acad1', opts, 'turma');
    const withoutSelect = buildStudentsListDocumentQueries('acad1', opts, 'turma', { withSelect: false });
    expect(withSelect.some((q) => String(q).includes('select'))).toBe(true);
    expect(withoutSelect.some((q) => String(q).includes('select'))).toBe(false);
  });

  it('permite omitir filtro de status para fallback do handler', () => {
    const opts = parseStudentsListQueryParams({});
    const withStatus = buildStudentsListDocumentQueries('acad1', opts, 'turma');
    const withoutStatus = buildStudentsListDocumentQueries('acad1', opts, 'turma', { withStatusFilter: false });
    expect(withStatus.length).toBeGreaterThan(withoutStatus.length);
  });
});
