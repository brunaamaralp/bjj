import React, { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import { createFinanceTx, fetchPayables } from '../../lib/financeTxApi.js';
import { useToast } from '../../hooks/useToast.js';
import { todayYmdLocal, addDaysYmd } from '../../lib/financeForecastCore.js';
import {
  MAX_PAYABLES_IMPORT_ROWS,
  PAYABLES_IMPORT_CONCURRENCY,
  mapPayablesImportColumns,
  buildPayablesImportPreviewRows,
  markPayablesImportDuplicates,
  collectPayablesImportExistingKeys,
  payableImportRowToPayload,
  downloadPayablesImportTemplate,
} from '../../lib/payablesImport.js';

function fmtMoneyBr(value) {
  try {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(value || 0).toFixed(2)}`;
  }
}

async function importPayablesRows(academyId, rows, onProgress) {
  let cursor = 0;
  let ok = 0;
  let fail = 0;
  const failedRows = [];

  async function worker() {
    while (cursor < rows.length) {
      const index = cursor;
      cursor += 1;
      const row = rows[index];
      try {
        await createFinanceTx({ academyId, payload: payableImportRowToPayload(row) });
        ok += 1;
      } catch {
        fail += 1;
        failedRows.push(row.rowIndex);
      }
      onProgress?.({ done: ok + fail, total: rows.length, ok, fail, failedRows: [...failedRows] });
    }
  }

  const workers = Math.min(PAYABLES_IMPORT_CONCURRENCY, rows.length);
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return { ok, fail, failedRows };
}

export default function ImportPayablesModal({ open, academyId, onClose, onImported }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState([]);
  const [parseError, setParseError] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [importProgress, setImportProgress] = useState({
    done: 0,
    total: 0,
    ok: 0,
    fail: 0,
    failedRows: [],
  });

  const reset = useCallback(() => {
    setPreview([]);
    setParseError('');
    setLoadingPreview(false);
    setImporting(false);
    setConfirmOpen(false);
    setImportProgress({ done: 0, total: 0, ok: 0, fail: 0, failedRows: [] });
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose?.();
  };

  const handleFile = (file) => {
    setParseError('');
    setPreview([]);
    Papa.parse(file, {
      delimiter: ';',
      skipEmptyLines: true,
      complete: (result) => {
        void (async () => {
          const rows = (result.data || []).filter((r) => r.some((c) => String(c || '').trim()));
          if (!rows.length) {
            setParseError('Arquivo vazio ou inválido.');
            return;
          }
          const [header, ...body] = rows;
          const columnMap = mapPayablesImportColumns(header);
          if (
            columnMap.fornecedor == null ||
            columnMap.valor == null ||
            columnMap.vencimento == null
          ) {
            setParseError(
              'Cabeçalho inválido. Use: fornecedor;categoria;valor;vencimento;recorrente;dia_recorrencia'
            );
            return;
          }
          const built = buildPayablesImportPreviewRows(
            body.slice(0, MAX_PAYABLES_IMPORT_ROWS),
            columnMap
          );
          if (!academyId) {
            setPreview(built);
            return;
          }
          setLoadingPreview(true);
          try {
            const today = todayYmdLocal();
            const payables = await fetchPayables({
              academyId,
              from: today,
              to: addDaysYmd(today, 365),
              section: 'contas-fixas',
            });
            const existingKeys = collectPayablesImportExistingKeys(payables?.items || []);
            setPreview(markPayablesImportDuplicates(built, existingKeys));
          } catch {
            setPreview(built);
            toast.warning('Não foi possível verificar duplicatas — revise o preview antes de importar.');
          } finally {
            setLoadingPreview(false);
          }
        })();
      },
      error: () => setParseError('Não foi possível ler o arquivo CSV.'),
    });
  };

  const validRows = preview.filter((r) => r.valid);
  const invalidCount = preview.length - validRows.length;
  const duplicateCount = preview.filter((r) => r.duplicate).length;
  const progressPct =
    importProgress.total > 0 ? Math.round((importProgress.done / importProgress.total) * 100) : 0;

  function requestImportConfirm() {
    if (validRows.length === 0) return;
    setConfirmOpen(true);
  }

  async function handleImportConfirmed() {
    if (!academyId || validRows.length === 0) return;
    setConfirmOpen(false);
    setImporting(true);
    setImportProgress({ done: 0, total: validRows.length, ok: 0, fail: 0, failedRows: [] });

    const { ok, fail, failedRows } = await importPayablesRows(
      academyId,
      validRows,
      setImportProgress
    );

    setImporting(false);

    if (ok > 0) {
      toast.success(`${ok} conta(s) importada(s).`);
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      window.dispatchEvent(new CustomEvent('navi-financial-tx-settled'));
      onImported?.();
      if (fail === 0) {
        handleClose();
      }
    }

    if (fail > 0) {
      const sample = failedRows.slice(0, 5).join(', ');
      const suffix = failedRows.length > 5 ? '…' : '';
      toast.error(
        fail === validRows.length
          ? 'Nenhuma linha foi importada. Verifique os dados e tente novamente.'
          : `${fail} linha(s) falharam (linhas ${sample}${suffix}).`
      );
    }
  }

  if (!open) return null;

  return (
    <>
      <ModalShell
        open={open}
        title="Importar contas a pagar"
        onClose={handleClose}
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={handleClose} disabled={importing}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={importing || loadingPreview || validRows.length === 0}
              onClick={requestImportConfirm}
            >
              {importing ? (
                <>
                  <Loader2 size={14} className="navi-async-btn__spin" aria-hidden />
                  Importando…
                </>
              ) : (
                `Importar ${validRows.length} linha(s)`
              )}
            </button>
          </>
        }
      >
        <p className="text-small text-muted mb-3">
          CSV separado por ponto e vírgula (;). Baixe o modelo para ver o formato esperado.
        </p>
        <div className="d-flex gap-2 mb-3 flex-wrap">
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={downloadPayablesImportTemplate}
            disabled={importing}
          >
            <FileSpreadsheet size={14} aria-hidden />
            Baixar modelo
          </button>
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={importing || loadingPreview}
          >
            <Upload size={14} aria-hidden />
            Escolher arquivo
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Arquivo CSV de contas a pagar"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </div>

        {loadingPreview ? (
          <p className="text-small text-muted mb-3" role="status">
            Verificando duplicatas…
          </p>
        ) : null}

        {parseError ? <ErrorBanner message={parseError} className="mb-3" /> : null}

        {importing ? (
          <div className="payables-import-progress mb-3" role="status" aria-live="polite">
            <p className="text-small mb-2">
              Importando {importProgress.done} de {importProgress.total}…
              {importProgress.ok > 0 ? ` · ${importProgress.ok} criada(s)` : ''}
              {importProgress.fail > 0 ? ` · ${importProgress.fail} falha(s)` : ''}
            </p>
            <div className="product-import-progress-track" aria-hidden="true">
              <div className="product-import-progress-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        ) : null}

        {preview.length > 0 ? (
          <>
            <p className="text-small mb-2">
              {validRows.length} válida(s)
              {invalidCount > 0 ? ` · ${invalidCount} com erro` : ''}
              {duplicateCount > 0 ? ` · ${duplicateCount} duplicada(s)` : ''}
            </p>
            <div className="payables-import-preview-wrap finance-table-wrap">
              <table className="finance-table finance-table--compact">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Fornecedor</th>
                    <th>Vencimento</th>
                    <th className="text-right">Valor</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.rowIndex}>
                      <td>{row.rowIndex}</td>
                      <td>{row.vendor || '—'}</td>
                      <td>{row.due_date || '—'}</td>
                      <td className="text-right">{fmtMoneyBr(row.amount)}</td>
                      <td className={row.valid ? 'text-success' : 'text-danger'}>
                        {row.valid ? 'OK' : row.errors.join(', ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </ModalShell>

      <ConfirmDialog
        open={confirmOpen}
        title="Importar contas a pagar"
        description={`Serão criadas ${validRows.length} conta(s) a pagar. Linhas duplicadas ou com erro serão ignoradas. Deseja continuar?`}
        confirmLabel="Importar"
        confirmVariant="primary"
        loading={importing}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleImportConfirmed()}
      />
    </>
  );
}
