import { describe, it, expect } from 'vitest';
import { buildStudentPayloadFromDoc, isLegacyStudentLeadDoc } from '../lib/leadStudentPayload.js';

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
});
