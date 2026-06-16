import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FileSpreadsheet, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';
import {
  detectAndParseBankFile,
  summarizeParsedItems,
  itemsToEditable,
  toImportItems,
} from '../../lib/bankStatementParse.js';
import {
  detectSourceFormat,
  MAX_BANK_STATEMENT_ITEMS,
  MAX_PDF_BYTES,
  parseXlsxBankStatement,
  readFileAsArrayBuffer,
  readFileAsBase64,
  readFileAsText,
} from '../../lib/bankStatementParseXlsx.js';
import { importBankStatement, parseBankStatementWithAi } from '../../lib/bankReconciliationApi.js';
import { friendlyError } from '../../lib/errorMessages';
import BankAccountSelect from './BankAccountSelect.jsx';
import ModalShell from '../shared/ModalShell.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';

const STEPS = ['Upload', 'Processando', 'Revisar'];

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

const PARSE_ERROR_HINTS = {
  arquivo_vazio: 'O arquivo está vazio.',
  csv_invalido: 'CSV inválido. Exporte novamente do banco.',
  ofx_invalido: 'OFX inválido. Baixe o extrato novamente.',
  colunas_nao_detectadas: 'Não identifiquei colunas de data e valor. Tente CSV/OFX ou use "Interpretar com IA".',
  xlsx_invalido: 'Planilha inválida. Verifique o formato.',
  nenhuma_linha: 'Nenhuma linha encontrada na planilha.',
};

function stepIndex(step) {
  if (step === 'processing') return 1;
  if (step === 'review') return 2;
  return 0;
}

export default function ImportStatementModal({ academyId, open, onClose, onImported }) {
  const fileRef = useRef(null);
  const aiAbortRef = useRef(false);
  const [step, setStep] = useState('upload');
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState('');
  const [editableItems, setEditableItems] = useState([]);
  const [sourceFormat, setSourceFormat] = useState('');
  const [parseMethod, setParseMethod] = useState('deterministic');
  const [parseWarnings, setParseWarnings] = useState('');
  const [parseError, setParseError] = useState('');
  const [tabularFallback, setTabularFallback] = useState(null);
  const [importing, setImporting] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [importError, setImportError] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [pdfBase64, setPdfBase64] = useState('');
  const [filterQuery, setFilterQuery] = useState('');

  const importItems = useMemo(() => toImportItems(editableItems), [editableItems]);
  const summary = useMemo(() => summarizeParsedItems(importItems), [importItems]);
  const overLimit = importItems.length > MAX_BANK_STATEMENT_ITEMS;
  const canUseAi = Boolean(tabularFallback?.headers?.length || tabularFallback?.rows?.length || pdfBase64);
  const hasLowConfidence = editableItems.some((r) => r.low_confidence);

  const filteredEditable = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return editableItems;
    return editableItems.filter((row) => {
      const hay = `${row.date || ''} ${row.description || ''} ${row.amount || ''} ${row.direction || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [editableItems, filterQuery]);

  const reset = () => {
    aiAbortRef.current = false;
    setStep('upload');
    setDragOver(false);
    setFileName('');
    setEditableItems([]);
    setSourceFormat('');
    setParseMethod('deterministic');
    setParseWarnings('');
    setParseError('');
    setTabularFallback(null);
    setImportError('');
    setBankAccount('');
    setPdfBase64('');
    setFilterQuery('');
  };

  const handleClose = () => {
    if (importing || aiBusy) return;
    reset();
    onClose?.();
  };

  const applyParsed = ({ items, format, method = 'deterministic', warnings = '' }) => {
    setEditableItems(itemsToEditable(items));
    setSourceFormat(format);
    setParseMethod(method);
    setParseWarnings(warnings);
    setParseError('');
    setStep('review');
  };

  const runAiParse = async ({ auto = false, pdfContent = null, filename: filenameOverride = null } = {}) => {
    if (!academyId) return;
    aiAbortRef.current = false;
    setAiBusy(true);
    setParseError('');
    setImportError('');
    setStep('processing');
    const activePdf = pdfContent || pdfBase64;
    const activeFilename = filenameOverride || fileName;
    try {
      const payload = activePdf
        ? { mode: 'pdf', content_base64: activePdf, filename: activeFilename }
        : {
            mode: 'tabular',
            headers: tabularFallback?.headers || [],
            sample_rows: tabularFallback?.rows || [],
            filename: activeFilename,
          };
      const result = await parseBankStatementWithAi(academyId, payload);
      if (aiAbortRef.current) return;
      applyParsed({
        items: result.items || [],
        format: activePdf ? 'pdf' : sourceFormat || 'xlsx',
        method: 'ai',
        warnings: [result.summary, ...(result.warnings || [])].filter(Boolean).join(' '),
      });
      setPdfBase64('');
      setTabularFallback(null);
    } catch (err) {
      if (aiAbortRef.current) return;
      console.error(err);
      setParseError(String(err?.message || friendlyError(err, 'load')));
      setStep(auto ? 'upload' : 'upload');
    } finally {
      setAiBusy(false);
    }
  };

  const processFile = async (file) => {
    if (!file) return;
    setParseError('');
    setImportError('');
    setTabularFallback(null);
    setPdfBase64('');
    setFilterQuery('');
    setFileName(file.name);

    const format = detectSourceFormat(file.name);
    setSourceFormat(format);

    try {
      if (format === 'pdf') {
        if (file.size > MAX_PDF_BYTES) {
          setParseError('PDF muito grande (máx. 5 MB).');
          setEditableItems([]);
          setStep('upload');
          return;
        }
        const b64 = await readFileAsBase64(file);
        setPdfBase64(b64);
        setEditableItems([]);
        setParseError('');
        void runAiParse({ auto: true, pdfContent: b64, filename: file.name });
        return;
      }

      if (format === 'xlsx') {
        const buf = await readFileAsArrayBuffer(file);
        const parsed = await parseXlsxBankStatement(buf);
        if (parsed.error === 'colunas_nao_detectadas') {
          setTabularFallback({ headers: parsed.headers, rows: parsed.rows });
          setParseError(PARSE_ERROR_HINTS.colunas_nao_detectadas);
          setEditableItems([]);
          setStep('upload');
          return;
        }
        if (parsed.error || !parsed.items?.length) {
          setParseError(PARSE_ERROR_HINTS[parsed.error] || 'Nenhuma transação detectada no arquivo.');
          if (parsed.headers?.length) setTabularFallback({ headers: parsed.headers, rows: parsed.rows });
          setEditableItems([]);
          setStep('upload');
          return;
        }
        applyParsed({ items: parsed.items, format: 'xlsx', method: 'deterministic' });
        return;
      }

      const text = await readFileAsText(file);
      const parsed = detectAndParseBankFile(file.name, text);
      if (parsed.error || !parsed.items?.length) {
        if (parsed.headers?.length || parsed.rows?.length) {
          setTabularFallback({ headers: parsed.headers, rows: parsed.rows });
        }
        setParseError(
          PARSE_ERROR_HINTS[parsed.error] || 'Nenhuma transação detectada. Tente "Interpretar com IA".'
        );
        setEditableItems([]);
        setStep('upload');
        return;
      }
      applyParsed({
        items: parsed.items,
        format: parsed.format || format,
        method: parsed.parse_method || 'deterministic',
      });
    } catch (err) {
      console.error(err);
      setParseError(friendlyError(err, 'load'));
      setEditableItems([]);
      setStep('upload');
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    await processFile(file);
    e.target.value = '';
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    await processFile(file);
  };

  const cancelAi = () => {
    aiAbortRef.current = true;
    setAiBusy(false);
    setStep('upload');
    setPdfBase64('');
  };

  const updateItem = (key, patch) => {
    setEditableItems((prev) => prev.map((it) => (it._key === key ? { ...it, ...patch } : it)));
  };

  const removeItem = (key) => {
    setEditableItems((prev) => prev.filter((it) => it._key !== key));
  };

  const confirmImport = async () => {
    if (!academyId || !importItems.length || overLimit) return;
    setImporting(true);
    setImportError('');
    try {
      const result = await importBankStatement(academyId, {
        filename: fileName,
        items: importItems,
        period_start: summary.period_start,
        period_end: summary.period_end,
        bank_account: bankAccount || undefined,
        source_format: sourceFormat || detectSourceFormat(fileName),
        parse_method: parseMethod,
        parse_warnings: parseWarnings || undefined,
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

  useEffect(() => {
    if (!open) reset();
  }, [open]);

  const currentStep = stepIndex(step);
  const progressPct = ((currentStep + 1) / STEPS.length) * 100;

  return (
    <ModalShell
      open={open}
      title="Importar extrato bancário"
      onClose={handleClose}
      closeOnOverlay={!importing && !aiBusy}
      closeOnEsc={!importing && !aiBusy}
      maxWidth={720}
      className="navi-modal-overlay--form"
      dialogClassName="import-statement-dialog"
      footer={
        <div className="flex gap-2 import-statement-actions">
          {step === 'processing' ? (
            <button type="button" className="btn-outline" onClick={cancelAi}>
              Cancelar interpretação
            </button>
          ) : (
            <>
              <button type="button" className="btn-outline" disabled={importing || aiBusy} onClick={handleClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={importing || aiBusy || step !== 'review' || !importItems.length || overLimit}
                onClick={() => void confirmImport()}
              >
                {importing ? 'Importando…' : 'Confirmar importação'}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className="import-statement-stepper product-import-progress" aria-hidden="true">
        <div
          className="product-import-progress-bar product-import-progress-bar--determinate"
          style={{ '--progress-pct': `${progressPct}%` }}
        />
      </div>
      <p className="text-small text-muted import-statement-lead">
        {STEPS[currentStep]}
        {fileName ? ` · ${fileName}` : ''}
      </p>

      {step === 'upload' ? (
        <>
          <p className="text-small text-muted import-statement-lead">
            Envie OFX, CSV, Excel (.xlsx) ou PDF. Revise e edite as transações antes de confirmar.
          </p>

          <div
            className={`import-statement-dropzone${dragOver ? ' import-statement-dropzone--drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click();
            }}
          >
            {fileName ? (
              <div className="finance-import-file-chip" onClick={(e) => e.stopPropagation()}>
                <FileSpreadsheet size={20} aria-hidden />
                <span className="finance-import-file-name">{fileName}</span>
                <button
                  type="button"
                  className="finance-import-link finance-import-file-change"
                  onClick={() => fileRef.current?.click()}
                >
                  Trocar arquivo
                </button>
              </div>
            ) : (
              <>
                <div className="finance-import-upload-icon" aria-hidden>
                  <Upload size={40} strokeWidth={1.75} />
                </div>
                <p className="finance-import-drop-title">Clique ou arraste o extrato aqui</p>
                <p className="finance-import-drop-hint">OFX, CSV, Excel (.xlsx) ou PDF</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.ofx,.qfx,.xlsx,.xls,.pdf,text/csv,application/pdf"
              className="finance-import-file-input"
              aria-hidden
              tabIndex={-1}
              onChange={onFile}
            />
          </div>

          {parseError ? (
            <div className="mt-2">
              <StatusBanner variant="error">{parseError}</StatusBanner>
              {canUseAi ? (
                <button
                  type="button"
                  className="btn-outline btn-sm mt-2"
                  disabled={aiBusy}
                  onClick={() => void runAiParse()}
                >
                  <Sparkles size={14} /> {aiBusy ? 'Interpretando…' : 'Tentar novamente com IA'}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {step === 'processing' ? (
        <div className="import-statement-processing" role="status" aria-live="polite">
          <Loader2 size={28} className="import-statement-processing__spin" aria-hidden />
          <p className="import-statement-processing-text">Interpretando extrato…</p>
          <p className="text-small text-muted">A IA está extraindo as movimentações do arquivo.</p>
        </div>
      ) : null}

      {step === 'review' && editableItems.length > 0 ? (
        <>
          <div className="form-group mt-2">
            <BankAccountSelect
              academyId={academyId}
              value={bankAccount}
              onChange={setBankAccount}
              id="import-statement-bank-account"
              label="Conta do extrato"
              allowEmpty
              emptyLabel="Selecione a conta (recomendado)"
            />
          </div>

          {parseMethod === 'ai' && parseWarnings ? (
            <StatusBanner variant="info" className="mt-2">
              IA: {parseWarnings}
            </StatusBanner>
          ) : null}

          {overLimit ? (
            <StatusBanner variant="warning" className="mt-2">
              O extrato tem {importItems.length} linhas; o limite é {MAX_BANK_STATEMENT_ITEMS}. Remova linhas ou importe
              um período menor.
            </StatusBanner>
          ) : null}

          <div className="card import-statement-summary mt-2" role="status">
            <p className="text-small import-statement-summary-text">
              <strong>{summary.creditCount}</strong> créditos ({fmtMoney(summary.credit)}) ·{' '}
              <strong>{summary.debitCount}</strong> débitos ({fmtMoney(summary.debit)})
              {summary.period_start && summary.period_end ? (
                <>
                  {' '}
                  · Período {fmtDate(summary.period_start)} — {fmtDate(summary.period_end)}
                </>
              ) : null}
              {sourceFormat ? (
                <>
                  {' '}
                  · Formato {sourceFormat.toUpperCase()}
                  {parseMethod === 'ai' ? ' (IA)' : ''}
                </>
              ) : null}
            </p>
          </div>

          <div className="import-statement-filter mt-2">
            <input
              type="search"
              className="form-input import-statement-filter-input"
              placeholder="Buscar no preview…"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              aria-label="Buscar linhas no preview"
            />
            <p className="text-xs text-muted mt-1">
              {filteredEditable.length} de {editableItems.length} linhas
            </p>
          </div>

          {hasLowConfidence ? (
            <p className="import-statement-low-legend">Revisar linhas destacadas — a IA teve baixa confiança nelas.</p>
          ) : null}

          <div className="finance-table-wrap finance-table-wrap--modal import-statement-table import-statement-table--editable">
            <table className="finance-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Direção</th>
                  <th className="finance-num">Valor</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredEditable.map((row) => (
                  <tr key={row._key} className={row.low_confidence ? 'import-statement-row--low' : ''}>
                    <td>
                      <input
                        type="date"
                        className="form-input form-input--compact"
                        value={row.date || ''}
                        onChange={(e) => updateItem(row._key, { date: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        className="form-input form-input--compact"
                        value={row.description || ''}
                        onChange={(e) => updateItem(row._key, { description: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        className="form-input form-input--compact"
                        value={row.direction}
                        onChange={(e) => updateItem(row._key, { direction: e.target.value })}
                      >
                        <option value="credit">Crédito</option>
                        <option value="debit">Débito</option>
                      </select>
                    </td>
                    <td className="finance-num">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="form-input form-input--compact finance-num-input"
                        value={row.amount ?? ''}
                        onChange={(e) => updateItem(row._key, { amount: Number(e.target.value) })}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-icon btn-icon--danger"
                        aria-label="Remover linha"
                        onClick={() => removeItem(row._key)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {importError ? (
        <StatusBanner variant="error" className="mt-2">
          {importError}
        </StatusBanner>
      ) : null}
    </ModalShell>
  );
}
