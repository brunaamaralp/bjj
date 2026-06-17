import React, { useCallback, useRef, useState } from 'react';
import Papa from 'papaparse';
import { FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import ModalShell from '../shared/ModalShell.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { createFinanceTx } from '../../lib/financeTxApi.js';
import { useToast } from '../../hooks/useToast.js';
import {
  MAX_PAYABLES_IMPORT_ROWS,
  mapPayablesImportColumns,
  buildPayablesImportPreviewRows,
  payableImportRowToPayload,
  downloadPayablesImportTemplate,
} from '../../lib/payablesImport.js';

export default function ImportPayablesModal({ open, academyId, onClose, onImported }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);

  const reset = useCallback(() => {
    setPreview([]);
    setParseError('');
    setImporting(false);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const handleClose = () => {
    reset();
    onClose?.();
  };

  const handleFile = (file) => {
    setParseError('');
    Papa.parse(file, {
      delimiter: ';',
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data || []).filter((r) => r.some((c) => String(c || '').trim()));
        if (!rows.length) {
          setParseError('Arquivo vazio ou inválido.');
          return;
        }
        const [header, ...body] = rows;
        const columnMap = mapPayablesImportColumns(header);
        if (columnMap.fornecedor == null || columnMap.valor == null || columnMap.vencimento == null) {
          setParseError('Cabeçalho inválido. Use: fornecedor;categoria;valor;vencimento;recorrente;dia_recorrencia');
          return;
        }
        const built = buildPayablesImportPreviewRows(body.slice(0, MAX_PAYABLES_IMPORT_ROWS), columnMap);
        setPreview(built);
      },
      error: () => setParseError('Não foi possível ler o arquivo CSV.'),
    });
  };

  const validRows = preview.filter((r) => r.valid);
  const invalidCount = preview.length - validRows.length;

  async function handleImport() {
    if (!academyId || validRows.length === 0) return;
    setImporting(true);
    let ok = 0;
    let fail = 0;
    for (const row of validRows) {
      try {
        await createFinanceTx({ academyId, payload: payableImportRowToPayload(row) });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setImporting(false);
    if (ok > 0) {
      toast.success(`${ok} conta(s) importada(s).`);
      window.dispatchEvent(new CustomEvent('navi-finance-forecast-invalidate'));
      onImported?.();
      handleClose();
    }
    if (fail > 0) {
      toast.error(`${fail} linha(s) falharam na importação.`);
    }
  }

  if (!open) return null;

  return (
    <ModalShell
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
            disabled={importing || validRows.length === 0}
            onClick={() => void handleImport()}
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
        <button type="button" className="btn-outline btn-sm" onClick={downloadPayablesImportTemplate}>
          <FileSpreadsheet size={14} aria-hidden />
          Baixar modelo
        </button>
        <button
          type="button"
          className="btn-outline btn-sm"
          onClick={() => inputRef.current?.click()}
        >
          <Upload size={14} aria-hidden />
          Escolher arquivo
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
      {parseError ? <ErrorBanner message={parseError} className="mb-3" /> : null}
      {preview.length > 0 ? (
        <>
          <p className="text-small mb-2">
            {validRows.length} válida(s)
            {invalidCount > 0 ? ` · ${invalidCount} com erro` : ''}
          </p>
          <div className="finance-table-wrap" style={{ maxHeight: 280, overflow: 'auto' }}>
            <table className="finance-table finance-table--compact">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fornecedor</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.rowIndex}>
                    <td>{row.rowIndex}</td>
                    <td>{row.vendor || '—'}</td>
                    <td>{row.due_date || '—'}</td>
                    <td>{Number(row.amount || 0).toFixed(2)}</td>
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
  );
}
