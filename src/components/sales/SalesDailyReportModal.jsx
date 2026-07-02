import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, FileDown, FileText, Printer } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { fetchSalesDailyReport } from '../../lib/salesDailyReportApi.js';
import {
  buildDailyReportText,
  exportSalesDailyReportCsv,
} from '../../lib/salesDailyReport.js';
import { formatBRL } from '../../lib/moneyBr';
import { paymentFormLabel } from '../../lib/salePayments.js';
import { downloadSalesDailyReportPdf } from '../../lib/receiptDownload.js';

function formatDateBrYmd(dateYmd) {
  const s = String(dateYmd || '').slice(0, 10);
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

export default function SalesDailyReportModal({ open, onClose, dateYmd }) {
  const addToast = useUiStore((s) => s.addToast);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const load = useCallback(async () => {
    if (!dateYmd) return;
    setLoading(true);
    setError(null);
    try {
      const body = await fetchSalesDailyReport(dateYmd);
      setReport(body);
    } catch (e) {
      setError(e);
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [dateYmd]);

  useEffect(() => {
    if (!open || !dateYmd) return;
    void load();
  }, [open, dateYmd, load]);

  const text = useMemo(() => buildDailyReportText(report), [report]);
  const summary = report?.summary;

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      addToast({ type: 'success', message: 'Resumo copiado' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar' });
    }
  };

  const handleExportPdf = async () => {
    if (!dateYmd) return;
    setPdfLoading(true);
    try {
      await downloadSalesDailyReportPdf(dateYmd);
      addToast({ type: 'success', message: 'PDF baixado' });
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'action') });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleExportCsv = () => {
    if (!report) return;
    exportSalesDailyReportCsv(report);
    addToast({ type: 'success', message: 'CSV baixado' });
  };

  return (
    <ModalShell
      open={open}
      title={`Resumo do dia — ${formatDateBrYmd(dateYmd)}`}
      onClose={onClose}
      maxWidth={720}
      className="navi-modal-overlay--form"
      dialogClassName="sales-daily-report-modal card"
      footer={
        report && !loading && !error ? (
          <div className="sales-daily-report-modal__footer flex gap-2" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn-secondary" onClick={() => void handleCopy()}>
              <Copy size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Copiar resumo
            </button>
            <button type="button" className="btn-outline" onClick={handleExportCsv}>
              <FileDown size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Exportar CSV
            </button>
            <button
              type="button"
              className="btn-outline"
              disabled={pdfLoading}
              onClick={() => void handleExportPdf()}
            >
              <FileText size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              {pdfLoading ? 'Gerando PDF…' : 'Baixar PDF'}
            </button>
            <button type="button" className="btn-outline" onClick={() => window.print()}>
              <Printer size={16} aria-hidden style={{ marginRight: 6, verticalAlign: -2 }} />
              Imprimir
            </button>
            <button type="button" className="btn-outline" onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : (
          <div className="flex justify-end">
            <button type="button" className="btn-outline" onClick={onClose}>
              Fechar
            </button>
          </div>
        )
      }
    >
      <div className="sales-daily-report-modal__body sales-daily-report__print-area">
        {loading ? (
          <PageSkeleton variant="list" rows={4} />
        ) : error ? (
          <ErrorBanner message={friendlyError(error, 'load')} onRetry={() => void load()} />
        ) : report ? (
          <>
            {report.truncated || report.payments_truncated ? (
              <StatusBanner
                variant="warning"
                message="Muitos registros neste dia — o relatório pode estar incompleto. Use CSV ou PDF."
                className="mb-3"
              />
            ) : null}

            <div className="sales-daily-report-kpis">
              <div className="sales-daily-report-kpi">
                <span className="sales-daily-report-kpi__label">Vendas</span>
                <strong>{summary?.concluded_count ?? 0}</strong>
                <span className="text-small text-muted">{formatBRL(summary?.concluded_total)}</span>
              </div>
              <div className="sales-daily-report-kpi">
                <span className="sales-daily-report-kpi__label">Mensalidades</span>
                <strong>{summary?.payments_count ?? 0}</strong>
                <span className="text-small text-muted">{formatBRL(summary?.payments_total)}</span>
              </div>
              <div className="sales-daily-report-kpi">
                <span className="sales-daily-report-kpi__label">Total recepção</span>
                <strong>{formatBRL(summary?.reception_total)}</strong>
              </div>
              <div className="sales-daily-report-kpi">
                <span className="sales-daily-report-kpi__label">Canceladas</span>
                <strong>{summary?.cancel_count ?? 0}</strong>
              </div>
              {(summary?.pending_count ?? 0) > 0 ? (
                <div className="sales-daily-report-kpi">
                  <span className="sales-daily-report-kpi__label">A receber</span>
                  <strong>{summary.pending_count}</strong>
                  <span className="text-small text-muted">{formatBRL(summary.pending_total)}</span>
                </div>
              ) : null}
            </div>

            {Object.keys(report.totals_by_payment || {}).length > 0 ? (
              <div className="sales-daily-report-payments mt-3">
                <h4 className="navi-section-heading text-small">Por forma de pagamento</h4>
                <ul className="sales-daily-report-payments__list text-small">
                  {Object.entries(report.totals_by_payment)
                    .filter(([, v]) => Number(v) !== 0)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([forma, val]) => (
                      <li key={forma}>
                        {paymentFormLabel(forma)}: <strong>{formatBRL(val)}</strong>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            <p className="text-small text-muted mt-3" role="status">
              Fechamento da recepção: vendas concluídas + mensalidades recebidas no balcão (data de
              pagamento).
            </p>

            <pre className="sales-daily-report-preview text-small mt-3">{text}</pre>
          </>
        ) : null}
      </div>
    </ModalShell>
  );
}
