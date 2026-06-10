import React, { useCallback, useMemo, useRef, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import Papa from 'papaparse';
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { createSessionJwt } from '../../lib/appwrite';
import { createFinanceTx, listFinanceTx } from '../../lib/financeTxApi.js';
import { FINANCE_TX_LIST_MAX_PAGE_SIZE } from '../../lib/financeListLimits.js';
import { apiListStudentPayments } from '../../lib/studentPaymentsApi.js';
import { useStudentStore } from '../../store/useStudentStore.js';
import { applyAccountingSideEffectsAuto } from '../../lib/financeJournal.js';
import { friendlyError } from '../../lib/errorMessages.js';
import {
  MAX_FINANCE_TX_IMPORT_ROWS,
  FINANCE_TX_IMPORT_FIELD_OPTIONS,
  columnMappingFromAi,
  columnConfidenceFromAi,
  buildFinanceTxPreviewRows,
  countFinanceTxByStatus,
  financeTxRowToPayload,
  downloadFinanceTxImportTemplate,
  markFinanceTxImportDuplicates,
  collectExistingFinanceTxDedupKeys,
  dateRangeFromFinanceTxRows,
  monthsInDateRange,
  financeTxDedupKey,
} from '../../lib/financeTxImport.js';
const STEPS = ['Upload', 'Processando', 'Preview', 'Importando'];

async function ensureAllStudentsLoaded() {
  const store = useStudentStore.getState();
  if (!store.students.length) {
    await store.fetchStudents();
  }
  let guard = 0;
  while (useStudentStore.getState().studentsHasMore && guard < 40) {
    await useStudentStore.getState().fetchMoreStudents();
    guard += 1;
  }
  return useStudentStore.getState().students;
}

function studentNameByIdFromStudents(students) {
  const map = {};
  for (const s of students || []) {
    const id = String(s.id || s.$id || '').trim();
    if (!id) continue;
    map[id] = s.name || s.nome || '';
  }
  return map;
}

async function fetchExistingDedupKeys(academyId, previewRows, studentNameById) {
  const { from, to } = dateRangeFromFinanceTxRows(previewRows);
  const keys = new Set();
  if (!from || !to || !academyId) return keys;

  try {
    const txRes = await listFinanceTx({ academyId, from, to });
    for (const k of collectExistingFinanceTxDedupKeys({
      transactions: txRes.transactions || [],
      studentNameById,
    })) {
      keys.add(k);
    }
  } catch {
    void 0;
  }

  for (const ym of monthsInDateRange(from, to)) {
    try {
      let cursor = null;
      let guard = 0;
      do {
        const { payments, next_cursor: nextCursor } = await apiListStudentPayments({
          academyId,
          referenceMonth: ym,
          cursor,
          limit: FINANCE_TX_LIST_MAX_PAGE_SIZE,
        });
        for (const k of collectExistingFinanceTxDedupKeys({
          payments,
          studentNameById,
        })) {
          keys.add(k);
        }
        cursor = nextCursor;
        guard += 1;
      } while (cursor && guard < 30);
    } catch {
      void 0;
    }
  }

  return keys;
}

function fmtMoney(v) {
  try {
    return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${Number(v || 0).toFixed(2)}`;
  }
}

function fmtDate(iso) {
  if (!iso) return '—';
  const p = String(iso).slice(0, 10).split('-');
  if (p.length !== 3) return '—';
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  return (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || '');
      const delimiter = detectDelimiter(text);
      Papa.parse(text, {
        header: true,
        skipEmptyLines: 'greedy',
        delimiter,
        transformHeader: (h) => String(h || '').trim(),
        complete: (results) => {
          const headers = (results.meta?.fields || []).filter(Boolean);
          const rows = (results.data || []).filter((row) =>
            Object.values(row).some((v) => String(v ?? '').trim() !== '')
          );
          resolve({ headers, rows, delimiter });
        },
        error: (err) => reject(err),
      });
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsText(file, 'UTF-8');
  });
}

function parseXlsxFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const rows = Array.isArray(jsonRows) ? jsonRows : [];
        const headers = rows.length ? Object.keys(rows[0]).map((h) => String(h).trim()).filter(Boolean) : [];
        resolve({ headers, rows, delimiter: '' });
      } catch {
        reject(new Error('Erro ao ler a planilha. Verifique o formato.'));
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler o arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

async function fetchAiMapping(headers, sampleRows, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

  const res = await fetch('/api/agent?route=import-finance-tx', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': String(academyId || '').trim(),
    },
    body: JSON.stringify({ headers, sample_rows: sampleRows }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = data?.error || 'Erro ao consultar IA';
    const hint = String(data?.hint || '').trim();
    throw new Error(hint ? `${base} — ${hint}` : base);
  }
  return data;
}

function ConfidenceDot({ level }) {
  if (level === 'high') {
    return (
      <span className="product-import-conf">
        <span className="product-import-conf-dot product-import-conf-dot--high" aria-hidden />
        Alta
      </span>
    );
  }
  if (level === 'medium') {
    return (
      <span className="product-import-conf">
        <span className="product-import-conf-dot product-import-conf-dot--medium" aria-hidden />
        Média
      </span>
    );
  }
  return (
    <span className="product-import-conf">
      <span className="product-import-conf-dot product-import-conf-dot--none" aria-hidden />
      Sem match
    </span>
  );
}

function StatusIcon({ status, error }) {
  if (status === 'ready') return <CheckCircle2 size={18} className="product-import-status--ready" aria-hidden />;
  if (status === 'duplicate') {
    return (
      <AlertCircle
        size={18}
        className="product-import-status--warn"
        aria-hidden
        title={error || 'Duplicado'}
      />
    );
  }
  if (status === 'incomplete') return <AlertCircle size={18} className="product-import-status--warn" aria-hidden />;
  return <XCircle size={18} className="product-import-status--invalid" aria-hidden />;
}

export default function ImportFinanceTxModal({ open, onClose, onImported, academyId }) {
  const fileRef = useRef(null);
  const existingDedupKeysRef = useRef(new Set());
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [rowLimitWarning, setRowLimitWarning] = useState('');
  const [columnToField, setColumnToField] = useState({});
  const [columnConfidence, setColumnConfidence] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [dedupLoading, setDedupLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0, ok: 0, fail: 0 });
  const [importFinished, setImportFinished] = useState(false);

  const resetState = useCallback(() => {
    setStep(0);
    setError('');
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setPreviewRows([]);
    setRowLimitWarning('');
    setColumnToField({});
    setColumnConfidence({});
    setAiLoading(false);
    setAiSuggestions('');
    setDedupLoading(false);
    existingDedupKeysRef.current = new Set();
    setImportProgress({ done: 0, total: 0, ok: 0, fail: 0 });
    setImportFinished(false);
  }, []);

  const handleClose = () => {
    if (step === 3 && !importFinished) return;
    resetState();
    onClose?.();
  };

  const requiredMapped = useMemo(() => {
    const fields = Object.values(columnToField);
    return fields.includes('date') && fields.includes('amount');
  }, [columnToField]);

  const columnToFieldMap = useMemo(() => {
    const m = {};
    for (const [col, field] of Object.entries(columnToField)) if (field) m[col] = field;
    return m;
  }, [columnToField]);

  const statusCounts = useMemo(() => countFinanceTxByStatus(previewRows), [previewRows]);
  const selectedCount = useMemo(() => previewRows.filter((r) => r.selected).length, [previewRows]);
  const hasStudentMapped = useMemo(
    () => Object.values(columnToField).includes('student_name'),
    [columnToField]
  );

  const buildPreviewWithDedup = useCallback(
    async (rows, fieldMap) => {
      const base = buildFinanceTxPreviewRows(rows, fieldMap);
      if (!Object.values(fieldMap).includes('student_name')) {
        existingDedupKeysRef.current = new Set();
        setPreviewRows(base);
        return base;
      }

      setDedupLoading(true);
      try {
        const students = await ensureAllStudentsLoaded();
        const studentNameById = studentNameByIdFromStudents(students);
        const existingKeys = await fetchExistingDedupKeys(academyId, base, studentNameById);
        existingDedupKeysRef.current = existingKeys;
        const marked = markFinanceTxImportDuplicates(base, existingKeys);
        setPreviewRows(marked);
        return marked;
      } catch {
        existingDedupKeysRef.current = new Set();
        setPreviewRows(base);
        return base;
      } finally {
        setDedupLoading(false);
      }
    },
    [academyId]
  );

  const processFile = async (file) => {
    if (!file) return;
    const nameLower = String(file.name || '').toLowerCase();
    const isCsv = nameLower.endsWith('.csv');
    const isXlsx = nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls');
    if (!isCsv && !isXlsx) {
      setError('Selecione um arquivo CSV ou Excel (.xlsx/.xls)');
      return;
    }
    setError('');
    setFileName(file.name);
    try {
      const parsed = isCsv ? await parseCsvFile(file) : await parseXlsxFile(file);
      if (!parsed.headers.length) {
        setError('Não foi possível ler os cabeçalhos da planilha.');
        return;
      }
      let rows = parsed.rows;
      let warning = '';
      if (rows.length > MAX_FINANCE_TX_IMPORT_ROWS) {
        rows = rows.slice(0, MAX_FINANCE_TX_IMPORT_ROWS);
        warning = `O arquivo tem mais de ${MAX_FINANCE_TX_IMPORT_ROWS} linhas. Apenas as primeiras ${MAX_FINANCE_TX_IMPORT_ROWS} serão importadas.`;
      }
      setHeaders(parsed.headers);
      setDataRows(rows);
      setRowLimitWarning(warning);
      setStep(1);
      setAiLoading(true);
      let nextColumnToField = {};
      try {
        const ai = await fetchAiMapping(parsed.headers, rows.slice(0, 5), academyId);
        nextColumnToField = columnMappingFromAi(ai.mapping, parsed.headers);
        setColumnToField(nextColumnToField);
        setColumnConfidence(columnConfidenceFromAi(ai.confidence, ai.mapping, parsed.headers));
        setAiSuggestions(ai.suggestions || '');
      } catch (e) {
        const empty = {};
        for (const h of parsed.headers) empty[h] = '';
        nextColumnToField = empty;
        setColumnToField(empty);
        setColumnConfidence(Object.fromEntries(parsed.headers.map((h) => [h, 'unmapped'])));
        setAiSuggestions(friendlyError(e, 'load'));
      } finally {
        setAiLoading(false);
        setStep(2);
        const fieldMap = {};
        for (const [col, field] of Object.entries(nextColumnToField)) {
          if (field) fieldMap[col] = field;
        }
        const fields = Object.values(fieldMap);
        if (fields.includes('date') && fields.includes('amount')) {
          void buildPreviewWithDedup(rows, fieldMap);
        }
      }
    } catch (err) {
      setError(err?.message || 'Erro ao processar a planilha.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFieldSelect = (col, field) => {
    setColumnToField((prev) => {
      const next = { ...prev, [col]: field };
      if (field) {
        for (const [c, f] of Object.entries(next)) {
          if (c !== col && f === field) next[c] = '';
        }
      }
      return next;
    });
    setColumnConfidence((prev) => ({ ...prev, [col]: field ? 'high' : 'unmapped' }));
  };

  const refreshPreview = () => {
    void buildPreviewWithDedup(dataRows, columnToFieldMap);
  };

  const goToReview = () => {
    if (!requiredMapped) {
      setError('Mapeie as colunas Data e Valor antes de continuar.');
      return;
    }
    setError('');
    void buildPreviewWithDedup(dataRows, columnToFieldMap);
    setStep(2);
  };

  const runImport = async () => {
    const toImport = previewRows.filter((r) => r.selected && r.status === 'ready');
    if (!toImport.length) return;
    setStep(3);
    setImportFinished(false);
    setImportProgress({ done: 0, total: toImport.length, ok: 0, fail: 0 });

    let ok = 0;
    let fail = 0;
    const sessionKeys = new Set();

    for (let i = 0; i < toImport.length; i += 1) {
      const row = toImport[i];
      const key = financeTxDedupKey({
        dateIso: row.data?.dateIso,
        amount: row.data?.amount,
        studentName: row.data?.studentName,
      });
      if (key && (existingDedupKeysRef.current.has(key) || sessionKeys.has(key))) {
        fail += 1;
        setImportProgress({ done: i + 1, total: toImport.length, ok, fail });
        continue;
      }
      try {
        const payload = financeTxRowToPayload(row.data);
        const tx = await createFinanceTx({ academyId, payload });
        if (tx) applyAccountingSideEffectsAuto(tx, academyId);
        if (key) {
          sessionKeys.add(key);
          existingDedupKeysRef.current.add(key);
        }
        ok += 1;
      } catch (e) {
        console.error(e);
        fail += 1;
      }
      setImportProgress({ done: i + 1, total: toImport.length, ok, fail });
    }

    setImportFinished(true);
    if (ok > 0) onImported?.({ ok, fail });
  };

  if (!open) return null;

  const stepLabel = STEPS[Math.min(step, STEPS.length - 1)];

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      showCloseButton={false}
      closeOnOverlay={false}
      className="product-import-overlay"
      dialogClassName="product-import-modal"
      ariaLabelledBy="finance-tx-import-title"
    >
        <div className="product-import-progress" aria-hidden="true">
          <div
            className="product-import-progress-bar product-import-progress-bar--determinate"
            style={{ '--progress-pct': `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <header className="product-import-header">
          <div>
            <h2 id="finance-tx-import-title" className="product-import-title">
              <FileSpreadsheet size={20} aria-hidden />
              Importar lançamentos
            </h2>
            <p className="product-import-subtitle">
              {stepLabel}
              {fileName ? ` · ${fileName}` : ''}
            </p>
          </div>
          <button type="button" className="product-import-icon-btn" onClick={handleClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="product-import-body">
          {step === 0 ? (
            <>
              <div
                className={`product-import-dropzone${dragOver ? ' product-import-dropzone--drag' : ''}${error ? ' product-import-dropzone--error' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void processFile(e.dataTransfer.files?.[0]);
                }}
              >
                <Upload size={32} aria-hidden />
                <p>Arraste sua planilha ou clique para selecionar</p>
                <p className="text-xs text-muted">CSV, XLS ou XLSX · até {MAX_FINANCE_TX_IMPORT_ROWS} linhas</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="sr-only"
                  onChange={(e) => void processFile(e.target.files?.[0])}
                />
                <button type="button" className="btn-outline btn-sm mt-3" onClick={() => fileRef.current?.click()}>
                  Escolher arquivo
                </button>
              </div>
              <p className="text-xs text-muted mt-3">
                Colunas mínimas: <strong>Data</strong> e <strong>Valor Recebido</strong>. Mapeie também{' '}
                <strong>Aluno</strong> para detectar lançamentos já existentes (data + valor + aluno).
              </p>
              <button type="button" className="btn-link text-xs mt-2" onClick={downloadFinanceTxImportTemplate}>
                Baixar modelo CSV
              </button>
              {error ? <p className="product-import-error mt-2">{error}</p> : null}
            </>
          ) : null}

          {step === 1 ? (
            <div className="product-import-loading">
              <Loader2 size={28} className="animate-spin" aria-hidden />
              <p>Analisando planilha…</p>
              <div className="product-import-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <>
              {aiSuggestions ? <p className="product-import-hint">{aiSuggestions}</p> : null}
              {rowLimitWarning ? <p className="product-import-warn">{rowLimitWarning}</p> : null}

              <div className="product-import-mapping">
                <p className="text-sm font-medium mb-2">Mapeamento de colunas</p>
                {headers.map((col) => (
                  <div key={col} className="product-import-mapping-row">
                    <span className="product-import-mapping-col" title={col}>
                      {col}
                    </span>
                    <select
                      className="form-input"
                      value={columnToField[col] || ''}
                      onChange={(e) => handleFieldSelect(col, e.target.value)}
                    >
                      {FINANCE_TX_IMPORT_FIELD_OPTIONS.map((opt) => (
                        <option key={opt.value || 'ignore'} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <ConfidenceDot level={columnConfidence[col]} />
                  </div>
                ))}
              </div>

              {!requiredMapped ? (
                <p className="product-import-warn">Mapeie <strong>Data</strong> e <strong>Valor</strong> para continuar.</p>
              ) : null}

              {requiredMapped && !hasStudentMapped ? (
                <p className="product-import-warn">
                  Mapeie a coluna <strong>Aluno</strong> para o sistema identificar duplicatas automaticamente.
                </p>
              ) : null}

              {dedupLoading ? (
                <p className="product-import-hint mt-2">
                  <Loader2 size={14} className="animate-spin inline-block mr-1" aria-hidden />
                  Verificando lançamentos já existentes…
                </p>
              ) : null}

              {previewRows.length === 0 ? (
                <button type="button" className="btn-primary mt-3" disabled={!requiredMapped} onClick={goToReview}>
                  Gerar preview
                </button>
              ) : (
                <>
                  <div className="product-import-summary mt-3">
                    <span className="product-import-summary-item product-import-summary-item--ready">
                      {statusCounts.ready} prontos
                    </span>
                    <span className="product-import-summary-item product-import-summary-item--warn">
                      {statusCounts.incomplete} incompletos
                    </span>
                    <span className="product-import-summary-item product-import-summary-item--invalid">
                      {statusCounts.invalid} inválidos
                    </span>
                    <span className="product-import-summary-item product-import-summary-item--warn">
                      {statusCounts.duplicate} duplicados
                    </span>
                    <span className="product-import-summary-item">{selectedCount} selecionados</span>
                  </div>

                  <div className="product-import-table-wrap mt-3">
                    <table className="product-import-table">
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              checked={previewRows.every((r) => !r.selected || r.status !== 'ready') ? false : previewRows.filter((r) => r.status === 'ready').every((r) => r.selected)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setPreviewRows((prev) =>
                                  prev.map((r) => ({ ...r, selected: r.status === 'ready' ? checked : false }))
                                );
                              }}
                              aria-label="Selecionar todos os prontos"
                            />
                          </th>
                          <th>Status</th>
                          <th>Data</th>
                          <th>Valor</th>
                          <th>Aluno</th>
                          <th>Natureza</th>
                          <th>Categoria</th>
                          <th>Descrição</th>
                          <th>Observação</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.slice(0, 50).map((row) => (
                          <tr key={row.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={Boolean(row.selected)}
                                disabled={row.status !== 'ready'}
                                onChange={(e) =>
                                  setPreviewRows((prev) =>
                                    prev.map((r) => (r.id === row.id ? { ...r, selected: e.target.checked } : r))
                                  )
                                }
                              />
                            </td>
                            <td>
                              <StatusIcon status={row.status} error={row.error} />
                            </td>
                            <td>{fmtDate(row.data.dateIso)}</td>
                            <td>{fmtMoney(row.data.amount)}</td>
                            <td>{row.data.studentName || '—'}</td>
                            <td>{row.data.direction === 'out' ? 'Saída' : 'Entrada'}</td>
                            <td>{row.data.category}</td>
                            <td className="product-import-cell-note">{row.data.note || '—'}</td>
                            <td className="product-import-cell-note text-xs text-muted">{row.error || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {previewRows.length > 50 ? (
                      <p className="text-xs text-muted mt-2">Mostrando 50 de {previewRows.length} linhas.</p>
                    ) : null}
                  </div>
                </>
              )}

              {error ? <p className="product-import-error mt-2">{error}</p> : null}
            </>
          ) : null}

          {step === 3 ? (
            <div className="product-import-loading">
              {importFinished ? (
                <>
                  <CheckCircle2 size={40} className="product-import-status--ready" aria-hidden />
                  <p className="font-medium">Importação concluída</p>
                  <p className="text-sm text-muted">
                    {importProgress.ok} lançamento(s) criado(s)
                    {importProgress.fail ? ` · ${importProgress.fail} falha(s)` : ''}
                  </p>
                </>
              ) : (
                <>
                  <Loader2 size={28} className="animate-spin" aria-hidden />
                  <p>
                    Importando {importProgress.done} de {importProgress.total}…
                  </p>
                </>
              )}
            </div>
          ) : null}
        </div>

        <footer className="product-import-footer">
          {step === 2 && previewRows.length === 0 ? (
            <>
              <button type="button" className="btn-outline" onClick={resetState}>
                Voltar
              </button>
              <button type="button" className="btn-primary" disabled={!requiredMapped} onClick={goToReview}>
                Gerar preview
              </button>
            </>
          ) : null}
          {step === 2 && previewRows.length > 0 ? (
            <>
              <button
                type="button"
                className="btn-outline"
                disabled={dedupLoading}
                onClick={() => {
                  refreshPreview();
                }}
              >
                Atualizar preview
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={selectedCount === 0 || dedupLoading}
                onClick={() => void runImport()}
              >
                Importar {selectedCount} lançamento{selectedCount !== 1 ? 's' : ''}
              </button>
            </>
          ) : null}
          {step === 3 && importFinished ? (
            <button type="button" className="btn-primary" onClick={handleClose}>
              Fechar
            </button>
          ) : null}
        </footer>
    </ModalShell>
  );
}
