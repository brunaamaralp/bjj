import React, { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import { createSessionJwt } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { pickProductApiBody } from '../../lib/stockProducts';
import { formatBRL } from '../../lib/moneyBr';
import {
  MAX_IMPORT_ROWS,
  IMPORT_FIELD_OPTIONS,
  columnMappingFromAi,
  columnConfidenceFromAi,
  buildImportPreviewRows,
  countByStatus,
  classifyImportRow,
  importProductDedupKey,
} from '../../lib/productImport';

// Internamente ainda temos 4 estados, mas a UI agrupa em 3 etapas:
// Upload -> Processando (IA/importação) -> Preview.
const STEPS = ['Upload', 'Processando', 'Preview'];

function downloadProductImportTemplate() {
  const headers = ['Nome', 'Categoria', 'Tamanho', 'Preço de venda', 'Qtd. inicial'];
  const sampleRows = [
    ['Kimono Atama', 'Vestuário', 'A2', '499,90', '2'],
    ['Rashguard', 'Vestuário', 'M', '159,90', '0'],
  ];
  const csv = [headers, ...sampleRows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-produtos-nave.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function PulsingDots() {
  return (
    <div className="product-import-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function extractHintFromErrorMessage(msg) {
  const m = String(msg || '');
  const idx = m.indexOf(' HINT: ');
  if (idx === -1) return null;
  return m.slice(idx + 8).trim() || null;
}
async function fetchAiMapping(headers, sampleRows, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

  const res = await fetch('/api/leads?route=ai_import_products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': String(academyId || '').trim(),
    },
    body: JSON.stringify({
      headers,
      sample_rows: sampleRows,
      academy_id: academyId,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const base = data?.error || data?.erro || 'Erro ao consultar IA';
    const hint = String(data?.hint || '').trim();
    throw new Error(hint ? `${base} HINT: ${hint}` : base);
  }
  return data;
}

async function createProductApi(payload, academyId) {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('Sessão inválida');

  const res = await fetch('/api/products', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': String(academyId || '').trim(),
    },
    body: JSON.stringify({ action: 'create', ...pickProductApiBody(payload) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.erro || data.error || `Erro ${res.status}`);
  }
  return data.product;
}

function detectDelimiter(text) {
  const firstLine = String(text).split(/\r?\n/)[0] || '';
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  return semis > commas ? ';' : ',';
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

function StatusIcon({ status }) {
  if (status === 'ready') {
    return <CheckCircle2 size={18} className="product-import-status--ready" aria-hidden />;
  }
  if (status === 'incomplete') {
    return <AlertCircle size={18} className="product-import-status--warn" aria-hidden />;
  }
  return <XCircle size={18} className="product-import-status--invalid" aria-hidden />;
}

function RowSummary({ data }) {
  const nome = String(data.nome || '').trim() || '—';
  const tam = String(data.Tamanho || '').trim() || '—';
  const price =
    data.sale_price != null && Number.isFinite(Number(data.sale_price))
      ? formatBRL(data.sale_price)
      : 'R$ 0,00';
  const qty = data.initial_quantity ?? 0;
  return (
    <span className="product-import-row-summary">
      {nome} · {tam} · {price} · Qtd: {qty}
    </span>
  );
}

function EditRowPanel({ data, onChange, onClose, highlightMissing }) {
  return (
    <div className="product-import-edit-panel">
      <div className="product-import-edit-grid">
        <div className="form-group">
          <label className="text-xs">Nome *</label>
          <input
            className={`form-input${highlightMissing && !data.nome?.trim() ? ' product-import-input--warn' : ''}`}
            value={data.nome}
            onChange={(e) => onChange({ ...data, nome: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="text-xs">Categoria</label>
          <input
            className="form-input"
            value={data.categoria}
            onChange={(e) => onChange({ ...data, categoria: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="text-xs">Tamanho</label>
          <input
            className="form-input"
            value={data.Tamanho}
            onChange={(e) => onChange({ ...data, Tamanho: e.target.value })}
          />
        </div>
      </div>
      <div className="product-import-edit-grid product-import-edit-grid--secondary">
        <div className="form-group">
          <label className="text-xs">Preço venda</label>
          <input
            type="text"
            inputMode="decimal"
            pattern="[0-9]*[.,]?[0-9]*"
            className={`form-input${highlightMissing && !(Number(data.sale_price) > 0) ? ' product-import-input--warn' : ''}`}
            value={data.sale_price ?? ''}
            onChange={(e) => {
              const raw = String(e.target.value || '').replace(',', '.');
              onChange({
                ...data,
                sale_price: raw === '' ? null : Number(raw),
              });
            }}
          />
        </div>
        <div className="form-group">
          <label className="text-xs">Qtd. inicial</label>
          <input
            type="number"
            min={0}
            className="form-input"
            value={data.initial_quantity}
            onChange={(e) =>
              onChange({ ...data, initial_quantity: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
            }
          />
        </div>
      </div>
      <div className="product-import-edit-actions">
        <button type="button" className="btn-secondary btn-sm" onClick={onClose}>
          Aplicar
        </button>
      </div>
    </div>
  );
}

export default function ProductImportModal({ open, onClose, onImported }) {
  const academyId = useLeadStore((s) => s.academyId);
  const fileRef = useRef(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState([]);
  const [dataRows, setDataRows] = useState([]);
  const [previewRows, setPreviewRows] = useState([]);
  const [rowLimitWarning, setRowLimitWarning] = useState('');
  const [delimiter, setDelimiter] = useState(',');
  const [columnToField, setColumnToField] = useState({});
  const [columnConfidence, setColumnConfidence] = useState({});
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importProgress, setImportProgress] = useState({ done: 0, total: 0 });
  const [importResults, setImportResults] = useState([]);
  const [importFinished, setImportFinished] = useState(false);
  const [createdProductIds, setCreatedProductIds] = useState([]);

  const resetState = useCallback(() => {
    setStep(0); setError(''); setFileName(''); setHeaders([]); setDataRows([]);
    setPreviewRows([]); setRowLimitWarning(''); setColumnToField({}); setColumnConfidence({});
    setAiLoading(false); setAiSuggestions(''); setEditingId(null);
    setImportProgress({ done: 0, total: 0 }); setImportResults([]); setImportFinished(false);
    setCreatedProductIds([]);
  }, []);

  const handleClose = () => {
    if (step === 3 && !importFinished) return;
    resetState();
    onClose?.();
  };

  const nomeMapped = useMemo(() => Object.values(columnToField).includes('nome'), [columnToField]);
  const columnToFieldMap = useMemo(() => {
    const m = {};
    for (const [col, field] of Object.entries(columnToField)) if (field) m[col] = field;
    return m;
  }, [columnToField]);
  const statusCounts = useMemo(() => countByStatus(previewRows), [previewRows]);
  const selectedCount = useMemo(() => previewRows.filter((r) => r.selected).length, [previewRows]);

  const processFile = async (file) => {
    if (!file) return;
    const nameLower = String(file.name || '').toLowerCase();
    const isCsv = nameLower.endsWith('.csv');
    const isXlsx = nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls');
    if (!isCsv && !isXlsx) { setError('Selecione um arquivo CSV ou Excel (.xlsx/.xls)'); return; }
    setError(''); setFileName(file.name);
    try {
      const parsed = isCsv ? await parseCsvFile(file) : await parseXlsxFile(file);
      if (!parsed.headers.length) { setError('Não foi possível ler os cabeçalhos da planilha.'); return; }
      let rows = parsed.rows;
      let warning = '';
      if (rows.length > MAX_IMPORT_ROWS) {
        rows = rows.slice(0, MAX_IMPORT_ROWS);
        warning = `O arquivo tem mais de ${MAX_IMPORT_ROWS} linhas. Apenas as primeiras ${MAX_IMPORT_ROWS} serão importadas.`;
      }
      setHeaders(parsed.headers); setDataRows(rows); setDelimiter(parsed.delimiter);
      setRowLimitWarning(warning); setStep(1); setAiLoading(true);
      try {
        const ai = await fetchAiMapping(parsed.headers, rows.slice(0, 5), academyId);
        setColumnToField(columnMappingFromAi(ai.mapping, parsed.headers));
        setColumnConfidence(columnConfidenceFromAi(ai.confidence, ai.mapping, parsed.headers));
        setAiSuggestions(ai.suggestions || '');
      } catch (e) {
        const empty = {};
        for (const h of parsed.headers) empty[h] = '';
        setColumnToField(empty);
        setColumnConfidence(Object.fromEntries(parsed.headers.map((h) => [h, 'unmapped'])));
        setAiSuggestions(e?.message || 'Não foi possível obter sugestão da IA. Mapeie as colunas manualmente.');
      } finally { setAiLoading(false); }
    } catch (err) {
      setError(err?.message || 'Erro ao processar a planilha.');
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleFieldSelect = (col, field) => {
    setColumnToField((prev) => {
      const next = { ...prev, [col]: field };
      if (field) for (const [c, f] of Object.entries(next)) if (c !== col && f === field) next[c] = '';
      return next;
    });
    setColumnConfidence((prev) => ({ ...prev, [col]: field ? 'high' : 'unmapped' }));
  };

  const goToReview = () => { setPreviewRows(buildImportPreviewRows(dataRows, columnToFieldMap)); setStep(2); };
  const updatePreviewRow = (id, patch) => {
    setPreviewRows((prev) => prev.map((r) => {
      if (r.id !== id) return r;
      const data = patch.data ?? r.data;
      return { ...r, ...patch, data, status: classifyImportRow(data), selected: patch.selected !== undefined ? patch.selected : r.selected };
    }));
  };
  const selectAllReady = () => setPreviewRows((prev) => prev.map((r) => ({ ...r, selected: r.status === 'ready' })));

  const runImport = async () => {
    const toImport = previewRows.filter((r) => r.selected);
    if (!toImport.length) return;
    setStep(3);
    setImportFinished(false);
    setImportProgress({ done: 0, total: toImport.length });
    setImportResults([]);
    setCreatedProductIds([]);

    const results = [];
    const ids = [];
    const sessionKeys = new Set();
    const existingKeys = new Set();

    try {
      const jwt = await createSessionJwt();
      if (jwt) {
        const listRes = await fetch('/api/products', {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': String(academyId || '').trim(),
          },
        });
        const listData = await listRes.json().catch(() => ({}));
        if (listRes.ok && Array.isArray(listData.products)) {
          for (const p of listData.products) {
            existingKeys.add(importProductDedupKey(p));
          }
        }
      }
    } catch {
      void 0;
    }

    for (const row of toImport) {
      const key = importProductDedupKey(row.data);
      if (existingKeys.has(key)) {
        results.push({
          id: row.id,
          nome: row.data.nome || '(sem nome)',
          ok: false,
          error: 'Já existe no catálogo (mesmo SKU ou nome+tamanho)',
        });
        setImportResults([...results]);
        setImportProgress({ done: results.length, total: toImport.length });
        continue;
      }
      if (sessionKeys.has(key)) {
        results.push({
          id: row.id,
          nome: row.data.nome || '(sem nome)',
          ok: false,
          error: 'Duplicado na mesma importação',
        });
        setImportResults([...results]);
        setImportProgress({ done: results.length, total: toImport.length });
        continue;
      }

      try {
        const product = await createProductApi(row.data, academyId);
        sessionKeys.add(key);
        existingKeys.add(key);
        if (product?.id) ids.push(product.id);
        results.push({ id: row.id, nome: row.data.nome, ok: true });
      } catch (err) {
        results.push({
          id: row.id,
          nome: row.data.nome || '(sem nome)',
          ok: false,
          error: err?.message || 'Erro ao criar',
        });
      }
      setImportResults([...results]);
      setCreatedProductIds([...ids]);
      setImportProgress({ done: results.length, total: toImport.length });
    }

    setImportFinished(true);
    onImported?.({ ids, reload: true });
  };

  if (!open) return null;
  const previewSample = dataRows.slice(0, 3);
  const progressPct = importProgress.total ? (importProgress.done / importProgress.total) * 100 : 0;
  const isProcessing = (step === 1 && aiLoading) || step === 3;
  const uiStep = step === 0 ? 0 : isProcessing ? 1 : 2;
  const hasSelectedFile = Boolean(fileName);

  return (
    <div className="product-import-overlay" role="dialog" aria-modal="true" aria-labelledby="product-import-title">
      <div className="product-import-modal">
        {isProcessing ? (
          <div className="product-import-progress" aria-hidden="true">
            <div className="product-import-progress-bar" />
          </div>
        ) : null}
        <header className="product-import-header">
          <div>
            <h2 id="product-import-title" className="product-import-title">Importar produtos</h2>
            {uiStep === 0 ? (
              <p className="product-import-subtitle">Envie um CSV com seu catálogo. A IA sugere o mapeamento das colunas.</p>
            ) : null}
          </div>
          <button
            type="button"
            className="product-import-icon-btn"
            onClick={handleClose}
            aria-label="Fechar"
            disabled={step === 3 && !importFinished}
          >
            <X size={18} />
          </button>
        </header>
        <div className="product-import-stepper">
          {STEPS.map((label, i) => (
            <span
              key={label}
              className={`product-import-step${i === uiStep ? ' product-import-step--active' : ''}${i < uiStep ? ' product-import-step--done' : ''}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>
        <div className="product-import-body">
          {step === 0 && (
            <>
              <div
                className={`product-import-dropzone${dragOver ? ' product-import-dropzone--drag' : ''}${error ? ' product-import-dropzone--error' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); void processFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Selecionar ou arrastar CSV de produtos"
              >
                {error ? (
                  <div className="product-import-error-banner" role="alert">
                    <AlertCircle size={18} aria-hidden />
                    <div className="product-import-error-banner-text">
                      <strong>Não consegui processar esse arquivo.</strong>
                      <span>{extractHintFromErrorMessage(error) || error}</span>
                      <button
                        type="button"
                        className="product-import-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadProductImportTemplate();
                        }}
                      >
                        Baixar planilha modelo do Nave
                      </button>
                    </div>
                  </div>
                ) : null}

                {hasSelectedFile ? (
                  <div className="product-import-file-chip" onClick={(e) => e.stopPropagation()}>
                    <FileSpreadsheet size={20} aria-hidden />
                    <span className="product-import-file-name">{fileName}</span>
                    <button
                      type="button"
                      className="product-import-link product-import-file-change"
                      onClick={() => fileRef.current?.click()}
                    >
                      Trocar arquivo
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="product-import-upload-icon" aria-hidden>
                      <Upload size={40} strokeWidth={1.75} />
                    </div>
                    <p className="product-import-drop-title">Clique ou arraste sua planilha aqui</p>
                    <p className="product-import-drop-hint">CSV, Excel (.xlsx) ou .xls · máx. {MAX_IMPORT_ROWS} linhas</p>
                  </>
                )}

                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="product-import-file-input"
                  onChange={(e) => void processFile(e.target.files?.[0])}
                  aria-hidden
                  tabIndex={-1}
                />
              </div>
              <button
                type="button"
                className="product-import-template-btn"
                onClick={downloadProductImportTemplate}
              >
                Baixar modelo CSV/XLSX
              </button>
            </>
          )}
          {(step === 1 && aiLoading) && (
            <div className="product-import-processing" role="status" aria-live="polite">
              <div className="product-import-file-chip product-import-file-chip--center">
                <FileSpreadsheet size={22} aria-hidden />
                <span className="product-import-file-name">{fileName || 'Planilha'}</span>
              </div>
              <PulsingDots />
              <p className="product-import-processing-text">Interpretando sua planilha...</p>
            </div>
          )}
          {step === 1 && !aiLoading && (
            <>
              {rowLimitWarning ? <div className="product-import-warn-banner"><AlertCircle size={16} /> {rowLimitWarning}</div> : null}
              {aiSuggestions ? <p className="product-import-ai-tip">{aiSuggestions}</p> : null}
              <p className="text-small text-muted">Separador: <strong>{delimiter === ';' ? 'ponto e vírgula' : 'vírgula'}</strong> · {dataRows.length} linha(s)</p>
              {previewSample.length > 0 ? (
                <div className="preview-table-wrapper mt-2">
                  <table className="preview-table"><thead><tr>{headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                  <tbody>{previewSample.map((row, idx) => <tr key={idx}>{headers.map((h) => <td key={h}>{String(row[h] ?? '')}</td>)}</tr>)}</tbody></table>
                </div>
              ) : null}
              <table className="product-import-map-table mt-3">
                <thead><tr><th>Coluna CSV</th><th>Campo do sistema</th><th>Confiança</th></tr></thead>
                <tbody>{headers.map((col) => (
                  <tr key={col}><td>&quot;{col}&quot;</td>
                    <td><select className="form-input" value={columnToField[col] || ''} onChange={(e) => handleFieldSelect(col, e.target.value)}>
                      {IMPORT_FIELD_OPTIONS.map((opt) => <option key={opt.value || '_i'} value={opt.value}>{opt.label}</option>)}
                    </select></td>
                    <td><ConfidenceDot level={columnConfidence[col] || 'unmapped'} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </>
          )}
          {step === 2 && (
            <>
              <div className="product-import-summary-bar">
                <span className="product-import-summary-ready">✓ {statusCounts.ready || 0} prontos</span>
                <span className="product-import-summary-warn">⚠ {statusCounts.incomplete || 0} incompletos</span>
                <span className="product-import-summary-invalid">✗ {statusCounts.invalid || 0} inválidos</span>
              </div>

              <div className="product-import-preview-toolbar">
                <button type="button" className="btn-outline btn-sm" onClick={selectAllReady}>Selecionar todos prontos</button>
              </div>

              {previewRows.length === 0 ? (
                <div className="product-import-empty" role="status">
                  <div className="product-import-empty-icon" aria-hidden>
                    <FileSpreadsheet size={48} strokeWidth={1.25} />
                  </div>
                  <h3 className="product-import-empty-title">Nenhum produto identificado</h3>
                  <p className="product-import-empty-desc">
                    Não encontramos nenhum produto válido neste arquivo. Baixe o modelo e tente novamente.
                  </p>
                  <button type="button" className="product-import-btn-primary" onClick={downloadProductImportTemplate}>
                    Baixar modelo
                  </button>
                  <button type="button" className="product-import-link" onClick={() => setStep(0)}>
                    Enviar outro arquivo
                  </button>
                </div>
              ) : (
                <div className="product-import-table-scroll" role="region" aria-label="Pré-visualização dos produtos">
                  <table className="product-import-data-table">
                    <thead>
                      <tr>
                        <th aria-label="Selecionar" />
                        <th>Nome</th>
                        <th>Categoria</th>
                        <th>Tamanho</th>
                        <th>Cor</th>
                        <th>Preço</th>
                        <th>Qtd. inicial</th>
                        <th aria-label="Editar" />
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row) => {
                        const nome = String(row.data?.nome || '').trim();
                        const categoria = String(row.data?.categoria || '').trim();
                        const tamanho = String(row.data?.Tamanho || '').trim();
                        const cor = String(row.data?.color || '').trim();
                        const priceOk = row.data?.sale_price != null && Number(row.data.sale_price) > 0;
                        const price = priceOk ? formatBRL(row.data.sale_price) : '—';
                        const qty = Number(row.data?.initial_quantity ?? 0) || 0;
                        const highlightMissing = !nome || !priceOk;
                        return (
                          <tr
                            key={row.id}
                            className={highlightMissing ? 'product-import-row--warn' : undefined}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={row.selected}
                                disabled={row.status !== 'ready'}
                                onChange={(e) => updatePreviewRow(row.id, { selected: e.target.checked })}
                                aria-label="Selecionar produto"
                              />
                            </td>
                            <td>
                              {highlightMissing ? <AlertCircle size={14} className="product-import-row-icon" aria-hidden /> : null}
                              {nome || '—'}
                              {row.duplicateInFile ? (
                                <div className="text-small product-import-row-note">
                                  {row.statusNote || 'Duplicado no arquivo'}
                                </div>
                              ) : null}
                            </td>
                            <td>{categoria || '—'}</td>
                            <td>{tamanho || '—'}</td>
                            <td>{cor || '—'}</td>
                            <td>{price}</td>
                            <td>{qty}</td>
                            <td>
                              <button
                                type="button"
                                className="btn-outline btn-sm"
                                onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                              >
                                <Pencil size={14} aria-hidden /> Editar
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {editingId ? (
                <EditRowPanel
                  data={previewRows.find((r) => r.id === editingId)?.data || {}}
                  highlightMissing
                  onChange={(data) => {
                    const status = classifyImportRow(data);
                    const row = previewRows.find((r) => r.id === editingId);
                    updatePreviewRow(editingId, { data, status, selected: status === 'ready' ? true : row?.selected });
                  }}
                  onClose={() => setEditingId(null)}
                />
              ) : null}
            </>
          )}
          {step === 3 && (
            <>
              {!importFinished ? (
                <>
                  <div className="product-import-processing" role="status" aria-live="polite">
                    <div className="product-import-file-chip product-import-file-chip--center">
                      <FileSpreadsheet size={22} aria-hidden />
                      <span className="product-import-file-name">{fileName || 'Planilha'}</span>
                    </div>
                    <PulsingDots />
                    <p className="product-import-processing-text">Interpretando sua planilha...</p>
                    <div className="product-import-progress-track" aria-hidden="true">
                      <div className="product-import-progress-fill" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="text-small text-muted">Importando… {importProgress.done} de {importProgress.total}</p>
                  </div>
                </>
              ) : (
                <div>
                  <h4 className="navi-section-heading">Importação concluída!</h4>
                  <p className="product-import-summary-ready">✓ {importResults.filter((r) => r.ok).length} produto(s) criado(s)</p>
                  {importResults.some((r) => !r.ok) ? (
                    <ul className="product-import-fail-list">{importResults.filter((r) => !r.ok).map((r) => (
                      <li key={r.id}>✗ {r.nome} — {r.error}</li>
                    ))}</ul>
                  ) : null}
                </div>
              )}
              <ul className="product-import-live-list mt-2">{importResults.map((r) => (
                <li key={r.id} className={r.ok ? 'product-import-live-ok' : 'product-import-live-fail'}>
                  {r.ok ? <Check size={14} /> : <XCircle size={14} />}{r.nome}
                </li>
              ))}</ul>
            </>
          )}
        </div>
        <footer className="product-import-footer">
          {step === 0 ? (
            <button type="button" className="product-import-btn-ghost" onClick={handleClose}>
              Cancelar
            </button>
          ) : null}
          {step === 1 && !aiLoading ? (
            <>
              <button type="button" className="product-import-btn-ghost" onClick={() => setStep(0)}>
                Voltar
              </button>
              <button type="button" className="product-import-btn-primary" disabled={!nomeMapped} onClick={goToReview}>
                Continuar
              </button>
            </>
          ) : null}
          {step === 2 ? (
            <>
              <button type="button" className="product-import-btn-ghost" onClick={() => setStep(1)}>
                Cancelar
              </button>
              <button
                type="button"
                className="product-import-btn-primary"
                disabled={selectedCount === 0}
                onClick={() => void runImport()}
              >
                Importar {selectedCount} produto{selectedCount !== 1 ? 's' : ''}
              </button>
            </>
          ) : null}
          {step === 3 && importFinished ? (
            <>
              <button type="button" className="product-import-btn-ghost" onClick={handleClose}>Fechar</button>
              <button
                type="button"
                className="product-import-btn-primary"
                onClick={() => { onImported?.({ ids: createdProductIds, viewFilter: true }); resetState(); onClose?.(); }}
              >
                Ver produtos importados
              </button>
            </>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
