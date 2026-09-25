import { describe, expect, it } from 'vitest';
import {
  EXPERIMENTAL_PROFESSOR_NONE_ID,
  aggregateExperimentalByProfessor,
  buildExperimentalProfessorCsvRows,
  buildExperimentalProfessorEvent,
  buildExperimentalProfessorPatch,
  countsAsAttendedExperimentalInPeriod,
  experimentalProfessorChanged,
  readExperimentalProfessor,
} from '../../lib/experimentalProfessor.js';
import { LEAD_STATUS } from '../../src/lib/leadStatus.js';

const from = '2026-04-01T00:00:00.000Z';
const to = '2026-04-30T23:59:59.999Z';

describe('buildExperimentalProfessorPatch', () => {
  it('grava id e nome', () => {
    expect(buildExperimentalProfessorPatch({ userId: 'login:u1', name: 'Ana' })).toEqual({
      experimentalProfessorUserId: 'login:u1',
      experimentalProfessorName: 'Ana',
    });
  });

  it('limpa quando sem id', () => {
    expect(buildExperimentalProfessorPatch({ userId: '', name: 'X' })).toEqual({
      experimentalProfessorUserId: null,
      experimentalProfessorName: null,
    });
  });
});

describe('readExperimentalProfessor / changed / event', () => {
  it('lê camelCase e snake_case', () => {
    expect(
      readExperimentalProfessor({ experimental_professor_user_id: 'roster:1', experimental_professor_name: 'Bia' })
    ).toEqual({ userId: 'roster:1', name: 'Bia' });
  });

  it('detecta mudança', () => {
    expect(
      experimentalProfessorChanged(
        { experimentalProfessorUserId: 'login:a' },
        { userId: 'login:b', name: 'B' }
      )
    ).toBe(true);
    expect(
      experimentalProfessorChanged(
        { experimentalProfessorUserId: 'login:a' },
        { userId: 'login:a', name: 'A' }
      )
    ).toBe(false);
  });

  it('evento set vs changed', () => {
    expect(
      buildExperimentalProfessorEvent({
        prevLead: {},
        nextSelection: { userId: 'login:a', name: 'Ana' },
      }).type
    ).toBe('experimental_professor_set');
    expect(
      buildExperimentalProfessorEvent({
        prevLead: { experimentalProfessorUserId: 'login:a' },
        nextSelection: { userId: 'login:b', name: 'Bia' },
      }).type
    ).toBe('experimental_professor_changed');
  });
});

describe('countsAsAttendedExperimentalInPeriod', () => {
  it('conta attended_at no período', () => {
    expect(
      countsAsAttendedExperimentalInPeriod({ origin: 'Instagram', attended_at: '2026-04-10T12:00:00.000Z' }, from, to)
    ).toBe(true);
  });

  it('ignora planilha', () => {
    expect(
      countsAsAttendedExperimentalInPeriod(
        { origin: 'Planilha', attended_at: '2026-04-10T12:00:00.000Z' },
        from,
        to
      )
    ).toBe(false);
  });
});

describe('aggregateExperimentalByProfessor', () => {
  it('soma compareceu e conversão por professor + sem responsável', () => {
    const people = [
      {
        origin: 'IG',
        attended_at: '2026-04-05T12:00:00.000Z',
        experimental_professor_user_id: 'login:a',
        experimental_professor_name: 'Ana',
        contact_type: 'lead',
        status: LEAD_STATUS.COMPLETED,
      },
      {
        origin: 'IG',
        attended_at: '2026-04-06T12:00:00.000Z',
        experimental_professor_user_id: 'login:a',
        experimental_professor_name: 'Ana',
        converted_at: '2026-04-20T12:00:00.000Z',
        contact_type: 'student',
        status: LEAD_STATUS.CONVERTED,
      },
      {
        origin: 'IG',
        attended_at: '2026-04-07T12:00:00.000Z',
        contact_type: 'lead',
        status: LEAD_STATUS.COMPLETED,
      },
      {
        origin: 'IG',
        missed_at: '2026-04-08T12:00:00.000Z',
        experimental_professor_user_id: 'login:b',
        experimental_professor_name: 'Bia',
        status: LEAD_STATUS.MISSED,
      },
    ];
    const agg = aggregateExperimentalByProfessor(people, { from, to });
    const ana = agg.rows.find((r) => r.userId === 'login:a');
    expect(ana).toMatchObject({ attended: 2, converted: 1, missed: 0 });
    expect(agg.withoutProfessor.attended).toBe(1);
    const bia = agg.rows.find((r) => r.userId === 'login:b');
    expect(bia).toMatchObject({ attended: 0, converted: 0, missed: 1 });
    expect(agg.rows.some((r) => r.userId === EXPERIMENTAL_PROFESSOR_NONE_ID)).toBe(true);
  });

  it('monta CSV', () => {
    const rows = buildExperimentalProfessorCsvRows({
      rows: [{ name: 'Ana', attended: 2, converted: 1, missed: 0 }],
    });
    expect(rows[0][0]).toBe('Professor');
    expect(rows[1]).toEqual(['Ana', '2', '1', '0']);
  });
});
