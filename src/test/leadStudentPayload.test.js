import { describe, it, expect } from 'vitest';
import {
  buildStudentPayloadFromDoc,
  isLegacyStudentLeadDoc,
  mergeLeadQualificationIntoCustomAnswers,
  STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY,
} from '../lib/leadStudentPayload.js';
import { mapAppwriteDocToStudent } from '../lib/mapAppwriteStudentDoc.js';

describe('leadStudentPayload', () => {
  it('isLegacyStudentLeadDoc detects matriculado or contact_type student', () => {
    expect(isLegacyStudentLeadDoc({ status: 'Matriculado' })).toBe(true);
    expect(isLegacyStudentLeadDoc({ contact_type: 'student' })).toBe(true);
    expect(isLegacyStudentLeadDoc({ status: 'Novo' })).toBe(false);
  });

  it('buildStudentPayloadFromDoc maps core fields', () => {
    const payload = buildStudentPayloadFromDoc({
      name: ' Ana ',
      phone: '11999',
      academyId: 'ac1',
      origin: 'Instagram',
      plan: 'Mensal',
      student_status: 'active',
    });
    expect(payload.name).toBe('Ana');
    expect(payload.academyId).toBe('ac1');
    expect(payload.source_origin).toBe('Instagram');
    expect(payload.plan).toBe('Mensal');
    expect(payload.student_status).toBe('active');
  });

  it('buildStudentPayloadFromDoc maps belt from lead on conversion', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      belt: ' Azul ',
      academyId: 'ac1',
    });
    expect(payload.belt).toBe('Azul');
  });

  it('buildStudentPayloadFromDoc persists discount_amount when provided', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      academyId: 'ac1',
      plan: 'Mensal',
      discount_amount: 30,
    });
    expect(payload.discount_amount).toBe(30);
  });

  it('buildStudentPayloadFromDoc allows explicit zero discount override', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      academyId: 'ac1',
      plan: 'Mensal',
      discount_amount: 25,
      discountAmount: 0,
    });
    expect(payload.discount_amount).toBe(0);
  });

  it('does not persist age or is_first_experience on students payload', () => {
    const payload = buildStudentPayloadFromDoc({
      name: 'Ana',
      age: '8',
      is_first_experience: 'Não',
    });
    expect(payload).not.toHaveProperty('age');
    expect(payload).not.toHaveProperty('is_first_experience');
    const custom = JSON.parse(payload.custom_answers_json);
    expect(custom[STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY]).toBe('Não');
  });

  it('mergeLeadQualificationIntoCustomAnswers preserves existing answers', () => {
    const raw = JSON.stringify({ outro: 'x' });
    const merged = mergeLeadQualificationIntoCustomAnswers(raw, { isFirstExperience: 'Sim' });
    const obj = JSON.parse(merged);
    expect(obj.outro).toBe('x');
    expect(obj[STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY]).toBe('Sim');
  });

  it('does not overwrite primeira_experiencia already in custom_answers', () => {
    const raw = JSON.stringify({ [STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY]: 'Não' });
    const merged = mergeLeadQualificationIntoCustomAnswers(raw, { isFirstExperience: 'Sim' });
    expect(JSON.parse(merged)[STUDENT_CUSTOM_ANSWER_FIRST_EXPERIENCE_KEY]).toBe('Não');
  });

  it('mapAppwriteDocToStudent maps discount_amount to discountAmount', () => {
    const student = mapAppwriteDocToStudent({
      $id: 's1',
      name: 'Ana',
      phone: '11999',
      plan: 'Mensal',
      discount_amount: 25,
    });
    expect(student.discountAmount).toBe(25);
  });
});
