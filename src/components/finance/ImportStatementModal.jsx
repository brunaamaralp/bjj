import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Upload } from 'lucide-react';
import {
  detectAndParseBankFile,
  summarizeParsedItems,
} from '../../lib/bankStatementParse.js';
import { importBankStatement } from '../../lib/bankReconciliationApi.js';
import { friendlyError } from '../../lib/errorMessages';

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(ymd) {
  const p = String(ymd || '').split('-');
  if (p.length !== 3) return ymd || '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

export default function ImportStatementModal({ academyId, open, onClose, onImported }) {
  const [fileName, setFileName] = useState('');
  const [items, setItems] = useState([]);
  const [parseError, setParseError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');

  const summary = useMemo(() => summarizeParsedItems(items), [items]);

  const reset = () => {
    setFileName('');
    setItems([]);
    setParseError('');
    setImportError('');
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose?.();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError('');
    setImportError('');
    try {
      const text = await file.text();
      const parsed = detectAndParseBankFile(file.name, text);
      if (parsed.error) {
        setParseError(parsed.error);
        setItems([]);
        setFileName(file.name);
        return;
      }
      if (!parsed.items?.length) {
        setParseError('Nenhuma transação detectada no arquivo.');
        setItems([]);
        setFileName(file.name);
        return;
      }
      setFileName(file.name);
      setItems(parsed.items);
    } catch (err) {
      console.error(err);
      setParseError(friendlyError(err, 'load'));
      setItems([]);
    }
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!academyId || !items.length) return;
    setImporting(true);
    setImportError('');
    try {
      const result = await importBankStatement(academyId, {
        filename: fileName,
        items,
        period_start: summary.period_start,
        period_end: summary.period_end,
      });
      onImported?.(result.statement_id);
      handleClose();
    } catch (err) {
      console.error(err);
      setImportError(String(err?.message || friendlyError(err, 'save')));
    } finally {
      setImporting(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="navi-modal-overlay"
      role="presentation"
      onClick={handleClose}
    >
      <div
        className="card import-statement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-statement-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="import-statement-title" className="navi-section-heading import-statement-title">
          Importar extrato bancário
        </h3>
        <p className="text-small text-muted import-statement-lead">
          Envie um arquivo OFX ou CSV. Revise as transações detectadas antes de confirmar a importação.
        </p>

        <label className="btn-outline import-statement-upload">
          <Upload size={16} />
          Selecionar arquivo
          <input
            type="file"
            accept=".csv,.ofx,.qfx,text/csv"
            className="import-statement-upload-input"
            onChange={onFile}
          />
        </label>
        {fileName ? (
          <p className="text-small text-muted import-statement-file">
            Arquivo: {fileName}
          </p>
        ) : null}
        {parseError ? (
          <p className="text-small import-statement-error">
            {parseError}
          </p>
        ) : null}

        {items.length > 0 ? (
          <>
            <div
              className="card import-statement-summary"
              role="status"
            >
              <p className="text-small import-statement-summary-text">
                <strong>{summary.creditCount}</strong> créditos ({fmtMoney(summary.credit)}) ·{' '}
                <strong>{summary.debitCount}</strong> débitos ({fmtMoney(summary.debit)})
                {summary.period_start && summary.period_end ? (
                  <>
                    {' '}
                    · Período {fmtDate(summary.period_start)} — {fmtDate(summary.period_end)}
                  </>
                ) : null}
              </p>
            </div>

            <div className="finance-table-wrap finance-table-wrap--modal import-statement-table">
              <table className="finance-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrição</th>
                    <th>Direção</th>
                    <th className="finance-num">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={`${row.date}-${idx}`}>
                      <td>{fmtDate(row.date)}</td>
                      <td>{row.description}</td>
                      <td>{row.direction === 'credit' ? 'Crédito' : 'Débito'}</td>
                      <td className="finance-num">{fmtMoney(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {importError ? (
          <p className="text-small import-statement-import-error">
            {importError}
          </p>
        ) : null}

        <div className="flex gap-2 mt-3 import-statement-actions">
          <button type="button" className="btn-outline" disabled={importing} onClick={handleClose}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={importing || !items.length}
            onClick={() => void confirmImport()}
          >
            {importing ? 'Importando…' : 'Confirmar importação'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
