import { describe, it, expect } from 'vitest';
import {
  buildManualAttendanceDocument,
  buildControlIdAttendanceDocument,
} from '../../lib/attendanceDocument.js';

describe('attendanceDocument payloads', () => {
  it('buildManualAttendanceDocument não inclui portal_id', () => {
    const doc = buildManualAttendanceDocument({
      lead_id: 'lead-1',
      academy_id: 'acad-1',
      portal_id: 'should-not-appear',
      checked_in_by: 'u1',
      checked_in_by_name: 'Ana',
    });
    expect(doc.student_id).toBe('lead-1');
    expect(doc.portal_id).toBeUndefined();
    expect(doc.source).toBe('manual');
  });

  it('buildControlIdAttendanceDocument não inclui portal_id nem event_type', () => {
    const doc = buildControlIdAttendanceDocument({
      academyId: 'acad-1',
      student: { $id: 'stu-1', name: 'João' },
      log: { id: 42, user_id: 7, time: 1_700_000_000, portal_id: 'p1', event: 'in' },
    });
    expect(doc.student_id).toBe('stu-1');
    expect(doc.student_name).toBe('João');
    expect(doc.device_log_id).toBe('42');
    expect(doc.portal_id).toBeUndefined();
    expect(doc.event_type).toBeUndefined();
  });
});
