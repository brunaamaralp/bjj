import { describe, expect, it } from 'vitest';
import { renderLessonStaffReportPdfBuffer } from '../../lib/receipts/renderLessonStaffReportPdf.js';
import { LESSON_STATUS_CONFIRMED } from '../../lib/lessonStaffRegister.js';

describe('renderLessonStaffReportPdfBuffer', () => {
  it('gera buffer PDF não vazio', async () => {
    const buf = await renderLessonStaffReportPdfBuffer({
      from: '2026-09-01',
      to: '2026-09-30',
      academyName: 'Academia Teste',
      confirmed_count: 2,
      cancelled_count: 1,
      totals: [
        { user_id: 'u1', name: 'Ana', as_professor: 2, as_instructor: 0 },
        { user_id: 'u2', name: 'Bruno', as_professor: 0, as_instructor: 1 },
      ],
      detail: [
        {
          slot_date: '2026-09-08',
          time_start: '19:00',
          name: 'Kids',
          lesson_status: LESSON_STATUS_CONFIRMED,
          professor_name: 'Ana',
          instructor_name: 'Bruno',
        },
      ],
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});
