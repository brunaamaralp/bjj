import React, { useCallback, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import {
  AlertCircle,
  Check,
  CheckCircle2,
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

const STEPS = ['Upload', 'Mapeamento', 'Revisão', 'Importando'];
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
    throw new Error(data?.error || data?.erro || 'Erro ao consultar IA');
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
      <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '1 1 160px', margin: 0 }}>
          <label className="text-xs">Nome *</label>
          <input
            className={`form-input${highlightMissing && !data.nome?.trim() ? ' product-import-input--warn' : ''}`}
            value={data.nome}
            onChange={(e) => onChange({ ...data, nome: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ flex: '1 1 120px', margin: 0 }}>
          <label className="text-xs">Categoria</label>
          <input
            className="form-input"
            value={data.categoria}
            onChange={(e) => onChange({ ...data, categoria: e.target.value })}
          />
        </div>
        <div className="form-group" style={{ flex: '0 1 80px', margin: 0 }}>
          <label className="text-xs">Tamanho</label>
          <input
            className="form-input"
            value={data.Tamanho}
            onChange={(e) => onChange({ ...data, Tamanho: e.target.value })}
          />
        </div>
      </div>
      <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: '1 1 100px', margin: 0 }}>
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
        <div className="form-group" style={{ flex: '1 1 80px', margin: 0 }}>
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
      <div className="flex justify-end mt-2">
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
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('Selecione um arquivo .csv'); return; }
    setError(''); setFileName(file.name);
    try {
      const parsed = await parseCsvFile(file);
      if (!parsed.headers.length) { setError('Não foi possível ler os cabeçalhos do CSV.'); return; }
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
      } catch {
        const empty = {};
        for (const h of parsed.headers) empty[h] = '';
        setColumnToField(empty);
        setColumnConfidence(Object.fromEntries(parsed.headers.map((h) => [h, 'unmapped'])));
        setAiSuggestions('Não foi possível obter sugestão da IA. Mapeie as colunas manualmente.');
      } finally { setAiLoading(false); }
    } catch (err) {
      setError(err?.message || 'Erro ao processar o CSV.');
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

  return (
    <div className="import-overlay" role="dialog" aria-modal="true">
      <div className="import-modal product-import-modal">
        <div className="import-header">
          <h3 className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0 }}>Importar produtos (CSV)</h3>
          <button type="button" className="icon-btn" onClick={handleClose} aria-label="Fechar" disabled={step === 3 && !importFinished}><X size={18} /></button>
        </div>
        <div className="product-import-stepper">
          {STEPS.map((label, i) => (
            <span key={label} className={`product-import-step${i === step ? ' product-import-step--active' : ''}${i < step ? ' product-import-step--done' : ''}`}>{i + 1}. {label}</span>
          ))}
        </div>
        <div className="import-body">
          {step === 0 && (
            <>
              <p className="navi-subtitle" style={{ marginTop: 0 }}>Envie um CSV com seu catálogo. A IA sugere o mapeamento das colunas.</p>
              <div className={`upload-zone${dragOver ? ' upload-zone--active' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); void processFile(e.dataTransfer.files?.[0]); }}
                onClick={() => fileRef.current?.click()}>
                <Upload size={32} color="var(--accent)" style={{ marginBottom: 10 }} />
                <p style={{ fontWeight: 600, margin: 0 }}>Arraste o CSV ou clique para selecionar</p>
                <p className="navi-subtitle" style={{ marginTop: 8 }}>Apenas .csv · máx. {MAX_IMPORT_ROWS} linhas</p>
                <button type="button" className="btn-outline btn-sm mt-2" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>Selecionar arquivo</button>
                <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => void processFile(e.target.files?.[0])} />
              </div>
              {fileName ? <p className="text-small text-muted mt-2">{fileName}</p> : null}
              {error ? <div className="import-error mt-2"><AlertCircle size={16} /> {error}</div> : null}
            </>
          )}
          {step === 1 && (aiLoading ? (
            <div className="product-import-center"><Loader2 className="product-import-spin" size={24} /><p>Analisando colunas com IA…</p></div>
          ) : (
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
          ))}
          {step === 2 && (
            <>
              <div className="product-import-summary-bar">
                <span className="product-import-summary-ready">✓ {statusCounts.ready || 0} prontos</span>
                <span className="product-import-summary-warn">⚠ {statusCounts.incomplete || 0} incompletos</span>
                <span className="product-import-summary-invalid">✗ {statusCounts.invalid || 0} inválidos</span>
              </div>
              <button type="button" className="btn-outline btn-sm mb-2" onClick={selectAllReady}>Selecionar todos prontos</button>
              <ul className="product-import-review-list">{previewRows.map((row) => (
                <li key={row.id} className={`product-import-review-item product-import-review-item--${row.status}`}>
                  <label className="product-import-review-check">
                    <input type="checkbox" checked={row.selected} onChange={(e) => updatePreviewRow(row.id, { selected: e.target.checked })} />
                    <StatusIcon status={row.status} />
                    <span className="product-import-row-summary-wrap">
                      <RowSummary data={row.data} />
                      {row.duplicateInFile ? (
                        <span className="text-small" style={{ color: 'var(--danger)', display: 'block' }}>
                          {row.statusNote || 'Duplicado no arquivo'}
                        </span>
                      ) : null}
                    </span>
                  </label>
                  <div className="product-import-review-actions">
                    {row.status === 'ready' ? <button type="button" className="btn-outline btn-sm" onClick={() => setEditingId(editingId === row.id ? null : row.id)}><Pencil size={14} /> Editar</button> : null}
                    {row.status === 'incomplete' ? <button type="button" className="btn-outline btn-sm" onClick={() => setEditingId(row.id)}>Completar</button> : null}
                    {row.status === 'invalid' ? <button type="button" className="btn-outline btn-sm" onClick={() => setEditingId(row.id)}>Corrigir</button> : null}
                  </div>
                  {editingId === row.id ? (
                    <EditRowPanel data={row.data} highlightMissing={row.status !== 'ready'}
                      onChange={(data) => { const status = classifyImportRow(data); updatePreviewRow(row.id, { data, status, selected: status === 'ready' ? true : row.selected }); }}
                      onClose={() => setEditingId(null)} />
                  ) : null}
                </li>
              ))}</ul>
            </>
          )}
          {step === 3 && (
            <>
              {!importFinished ? (
                <>
                  <p className="navi-subtitle">Importando… {importProgress.done} de {importProgress.total}</p>
                  <div className="product-import-progress-track"><div className="product-import-progress-bar" style={{ width: `${progressPct}%` }} /></div>
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
        <div className="import-footer">
          {step === 0 ? <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={handleClose}>Cancelar</button> : null}
          {step === 1 && !aiLoading ? (<>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setStep(0)}>Voltar</button>
            <button type="button" className="btn-secondary" style={{ flex: 1.3 }} disabled={!nomeMapped} onClick={goToReview}>Continuar</button>
          </>) : null}
          {step === 2 ? (<>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={() => setStep(1)}>Voltar</button>
            <button type="button" className="btn-secondary" style={{ flex: 1.3 }} disabled={selectedCount === 0} onClick={() => void runImport()}>Importar {selectedCount} produto{selectedCount !== 1 ? 's' : ''}</button>
          </>) : null}
          {step === 3 && importFinished ? (<>
            <button type="button" className="btn-outline" style={{ flex: 1 }} onClick={handleClose}>Fechar</button>
            <button type="button" className="btn-secondary" style={{ flex: 1.3 }} onClick={() => { onImported?.({ ids: createdProductIds, viewFilter: true }); resetState(); onClose?.(); }}>Ver produtos importados</button>
          </>) : null}
        </div>
      </div>
      <style>{`
        .product-import-modal { max-width: 720px; }
        .product-import-stepper { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 12px; border-bottom: 1px solid var(--border-light); font-size: 0.75rem; }
        .product-import-step { color: var(--text-muted); }
        .product-import-step--active { color: var(--accent); font-weight: 700; }
        .product-import-step--done { color: var(--success); }
        .product-import-center { min-height: 160px; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; }
        .product-import-spin { animation: product-import-spin 1s linear infinite; }
        @keyframes product-import-spin { to { transform: rotate(360deg); } }
        .upload-zone--active { border-color: var(--accent); background: var(--accent-light); }
        .product-import-warn-banner, .product-import-ai-tip { padding: 10px 12px; border-radius: 10px; font-size: 0.88rem; margin-bottom: 10px; display: flex; gap: 8px; }
        .product-import-warn-banner { background: rgba(201,162,39,0.12); color: var(--warning, #a67c00); }
        .product-import-ai-tip { background: #EEEDFE; color: #3d2f93; }
        .product-import-map-table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
        .product-import-map-table th, .product-import-map-table td { padding: 8px 10px; border-bottom: 1px solid var(--border-light); }
        .product-import-conf { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; }
        .product-import-conf-dot { width: 10px; height: 10px; border-radius: 50%; }
        .product-import-conf-dot--high { background: var(--success); }
        .product-import-conf-dot--medium { border: 2px solid var(--warning, #c9a227); background: transparent; box-sizing: border-box; }
        .product-import-conf-dot--none { background: var(--text-muted); opacity: 0.4; }
        .product-import-summary-bar { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; font-weight: 600; }
        .product-import-summary-ready { color: var(--success); }
        .product-import-summary-warn { color: var(--warning, #c9a227); }
        .product-import-summary-invalid { color: var(--danger); }
        .product-import-review-list { list-style: none; margin: 0; padding: 0; max-height: 320px; overflow-y: auto; }
        .product-import-review-item { border: 1px solid var(--border-light); border-radius: 10px; padding: 10px; margin-bottom: 8px; }
        .product-import-review-check { display: flex; align-items: center; gap: 8px; cursor: pointer; min-width: 0; }
        .product-import-row-summary { font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .product-import-review-actions { margin-top: 6px; }
        .product-import-status--ready { color: var(--success); flex-shrink: 0; }
        .product-import-status--warn { color: var(--warning, #c9a227); flex-shrink: 0; }
        .product-import-status--invalid { color: var(--danger); flex-shrink: 0; }
        .product-import-edit-panel { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--border-light); }
        .product-import-input--warn { border-color: var(--warning, #c9a227); }
        .product-import-progress-track { height: 8px; background: var(--border-light); border-radius: 4px; overflow: hidden; }
        .product-import-progress-bar { height: 100%; background: var(--accent); transition: width 0.2s; }
        .product-import-live-list { list-style: none; padding: 0; margin: 0; max-height: 200px; overflow-y: auto; }
        .product-import-live-list li { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; padding: 4px 0; }
        .product-import-live-ok { color: var(--success); }
        .product-import-live-fail { color: var(--danger); }
        .product-import-fail-list { font-size: 0.88rem; color: var(--danger); padding-left: 1.2rem; }
        .import-overlay { position: fixed; inset: 0; background: rgba(18,16,42,0.5); backdrop-filter: blur(4px); z-index: 10000; display: flex; align-items: flex-end; justify-content: center; }
        .import-modal { background: var(--surface); border-radius: 20px 20px 0 0; width: 100%; max-height: 90vh; display: flex; flex-direction: column; }
        .import-header { display: flex; justify-content: space-between; align-items: center; padding: 20px 20px 12px; }
        .import-body { padding: 12px 20px; overflow-y: auto; flex: 1; }
        .import-footer { padding: 16px 20px; border-top: 1px solid var(--border-light); display: flex; gap: 10px; }
        .upload-zone { border: 2px dashed var(--border); border-radius: var(--radius); padding: 32px 20px; text-align: center; cursor: pointer; background: var(--surface-hover); }
        .preview-table-wrapper { max-height: 120px; overflow: auto; border: 1px solid var(--border-light); border-radius: 8px; }
        .preview-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
        .preview-table th, .preview-table td { padding: 6px 8px; border-bottom: 1px solid var(--border-light); }
        .import-error { display: flex; align-items: center; gap: 8px; padding: 10px; background: rgba(225,93,75,0.1); color: var(--danger); border-radius: 8px; }
      `}</style>
    </div>
  );
}
