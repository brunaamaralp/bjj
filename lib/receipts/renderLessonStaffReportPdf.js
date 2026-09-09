import { renderReceiptPdf, pdfSafeText } from './receiptPdfLayout.js';
import { LESSON_STATUS_LABELS, normalizeLessonStatus } from '../lessonStaffRegister.js';

/**
 * @param {{
 *   from?: string,
 *   to?: string,
 *   academyName?: string,
 *   confirmed_count?: number,
 *   cancelled_count?: number,
 *   totals?: object[],
 *   detail?: object[],
 * }} payload
 */
export async function renderLessonStaffReportPdfBuffer(payload = {}) {
  const from = String(payload.from || '').trim();
  const to = String(payload.to || '').trim();
  const totals = Array.isArray(payload.totals) ? payload.totals : [];
  const detail = Array.isArray(payload.detail) ? payload.detail : [];

  return renderReceiptPdf((ctx) => {
    ctx.drawHeader({
      academyName: pdfSafeText(payload.academyName || 'Academia'),
      docTitle: 'Aulas por professor/instrutor',
      metaLine: `${from} a ${to}`,
    });

    ctx.sectionTitle('Resumo');
    ctx.keyValueRows([
      { label: 'Aulas confirmadas', value: String(payload.confirmed_count ?? 0) },
      { label: 'Nao houve aula', value: String(payload.cancelled_count ?? 0) },
    ]);

    ctx.divider();
    ctx.sectionTitle('Totais por colaborador');
    if (!totals.length) {
      ctx.keyValueRows([{ label: 'Sem registros', value: '—' }]);
    } else {
      ctx.keyValueRows(
        totals.map((row) => ({
          label: pdfSafeText(row.name || row.user_id),
          value: `Prof ${row.as_professor || 0} · Inst ${row.as_instructor || 0}`,
        }))
      );
    }

    const maxDetail = 80;
    const slice = detail.slice(0, maxDetail);
    if (slice.length) {
      ctx.divider();
      ctx.sectionTitle(
        detail.length > maxDetail
          ? `Detalhe (primeiras ${maxDetail} de ${detail.length})`
          : 'Detalhe'
      );
      ctx.keyValueRows(
        slice.map((row) => {
          const status = LESSON_STATUS_LABELS[normalizeLessonStatus(row.lesson_status)] || '';
          const staff = [row.professor_name, row.instructor_name].filter(Boolean).join(' / ');
          return {
            label: pdfSafeText(`${row.slot_date} ${row.time_start || ''} ${row.name || ''}`.trim()),
            value: pdfSafeText(`${status}${staff ? ` · ${staff}` : ''}`),
          };
        })
      );
    }
  });
}
