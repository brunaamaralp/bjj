import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  FileSpreadsheet,
  RefreshCcw,
  Upload,
  X,
} from 'lucide-react';
import { createSessionJwt } from '../../lib/appwrite';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const VIOLET = 'var(--petroleo)';
const CORAL = '#F04040';

const PREVIEW_TABS = [
  { id: 'accounts', label: 'Plano de Contas' },
  { id: 'plans', label: 'Planos de Pagamento' },
  { id: 'bankAccounts', label: 'Contas Bancárias' },
];

function hasAnyData(parsed) {
  if (!parsed) return false;
  return (parsed.accounts?.length || 0) > 0 || (parsed.plans?.length || 0) > 0 || (parsed.bankAccounts?.length || 0) > 0;
}

function isAccountRowInvalid(row) {
  return !String(row?.code || '').trim() || !String(row?.name || '').trim();
}

function isPlanRowInvalid(row) {
  return !String(row?.name || '').trim() || !Number.isFinite(Number(row?.price));
}

function isBankRowInvalid(row) {
  const bank = String(row?.bankName || '').trim();
  const account = String(row?.account || '').trim();
  const pix = String(row?.pixKey || '').trim();
  return !bank && !account && !pix;
}

function downloadFinanceImportTemplate() {
  const headers = ['Código', 'Nome', 'Tipo', 'Natureza', 'Grupo DRE', 'Classe DFC', 'Subcl. DFC', 'Caixa'];
  const sampleRows = [
    ['1', 'Ativo', 'ativo', 'devedora', '', '', '', 'Não'],
    ['1.1', 'Circulante', 'ativo', 'devedora', '', '', '', 'Não'],
    ['1.1.1', 'Caixa', 'ativo', 'devedora', '', 'Operacional', '', 'Sim'],
  ];
  const csv = [headers, ...sampleRows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'modelo-plano-de-contas-nave.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

function PulsingDots() {
  return (
    <div className="finance-import-dots" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

export default function ImportFinanceModal({
  open,
  onClose,
  onConfirm,
  academyId,
  academyName,
  hasExistingData,
}) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('upload');
  const [parsed, setParsed] = useState(null);
  const [error, setError] = useState('');
  const [errorHint, setErrorHint] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewTab, setPreviewTab] = useState('accounts');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [mode, setMode] = useState('merge');

  const previewTabs = useMemo(() => {
    if (!parsed) return [];
    return PREVIEW_TABS.filter((tab) => (parsed[tab.id]?.length || 0) > 0).map((tab) => ({
      ...tab,
      count: parsed[tab.id].length,
    }));
  }, [parsed]);

  const canImport = useMemo(() => hasAnyData(parsed), [parsed]);

  useEffect(() => {
    if (step !== 'preview' || !previewTabs.length) return;
    if (!previewTabs.some((t) => t.id === previewTab)) {
      setPreviewTab(previewTabs[0].id);
    }
  }, [step, previewTabs, previewTab]);

  const resetState = useCallback(() => {
    setStep('upload');
    setParsed(null);
    setError('');
    setErrorHint('');
    setSelectedFile(null);
    setDragOver(false);
    setPreviewTab('accounts');
    setMode('merge');
    if (fileRef.current) fileRef.current.value = '';
  }, []);

  const finishClose = useCallback(() => {
    resetState();
    setCloseConfirmOpen(false);
    onClose?.();
  }, [resetState, onClose]);

  const requestClose = useCallback(() => {
    if (step === 'loading' || step === 'saving') {
      setCloseConfirmOpen(true);
      return;
    }
    finishClose();
  }, [step, finishClose]);

  const processFile = useCallback(
    async (file) => {
      if (!file) return;

      setSelectedFile({ name: file.name, size: file.size });
      setError('');
      setErrorHint('');

      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const XLSX = await import('xlsx');
          const wb = XLSX.read(evt.target.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
          if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
            setError('A planilha está vazia.');
            setStep('upload');
            return;
          }

          setStep('loading');
          const jwt = await createSessionJwt();
          if (!jwt) throw new Error('Sessão inválida. Faça login novamente.');

          const res = await fetch('/api/agent?route=import-finance', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwt}`,
              'x-academy-id': String(academyId || '').trim(),
            },
            body: JSON.stringify({
              rows: jsonRows,
              academyName: String(academyName || '').trim(),
            }),
          });

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            const msg = data?.error || data?.erro || `Erro HTTP ${res.status}`;
            throw new Error(typeof msg === 'string' ? msg : 'Erro ao analisar planilha.');
          }
          if (data?.error && !hasAnyData(data)) {
            setErrorHint(String(data.hint || '').trim());
            throw new Error('Não consegui interpretar essa planilha.');
          }

          setParsed({
            accounts: Array.isArray(data.accounts) ? data.accounts : [],
            plans: Array.isArray(data.plans) ? data.plans : [],
            bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : [],
            summary: String(data.summary || '').trim(),
          });
          setError('');
          setErrorHint('');
          setStep('preview');
        } catch (err) {
          const msg = err?.message || 'Erro ao ler o arquivo. Verifique o formato.';
          setError(msg);
          if (err?.hint) setErrorHint(String(err.hint).trim());
          setStep('upload');
        }
      };

      reader.onerror = () => {
        setError('Erro ao ler o arquivo. Verifique o formato.');
        setStep('upload');
      };
      reader.readAsArrayBuffer(file);
    },
    [academyId, academyName]
  );

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    void processFile(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    void processFile(file);
  };

  const handleConfirm = async (selectedMode) => {
    setStep('saving');
    setError('');
    try {
      await onConfirm?.({
        ...(parsed || {}),
        mode: selectedMode,
      });
      resetState();
      onClose?.();
    } catch (err) {
      setError(err?.message || 'Falha ao importar dados.');
      setStep('preview');
    }
  };

  const showProgressBar = step === 'loading' || step === 'saving';
  const isParseError = Boolean(error) && error.includes('interpretar');

  if (!open) return null;

  const renderPreviewTable = () => {
    if (!parsed || !canImport) return null;

    if (previewTab === 'accounts') {
      return (
        <div className="finance-import-table-scroll" role="region" aria-label="Pré-visualização do plano de contas">
          <table className="finance-import-data-table">
            <thead>
              <tr>
                <th scope="col">Código</th>
                <th scope="col">Nome</th>
                <th scope="col">Tipo</th>
                <th scope="col">Natureza</th>
                <th scope="col">DRE</th>
              </tr>
            </thead>
            <tbody>
              {parsed.accounts.map((row, idx) => {
                const invalid = isAccountRowInvalid(row);
                return (
                  <tr key={`${row.code || 'acc'}-${idx}`} className={invalid ? 'finance-import-row--warn' : undefined}>
                    <td>
                      {invalid ? <AlertTriangle size={14} className="finance-import-row-icon" aria-hidden /> : null}
                      {row.code || '—'}
                    </td>
                    <td>{row.name || '—'}</td>
                    <td>{row.type || '—'}</td>
                    <td>{row.nature || '—'}</td>
                    <td>{row.dreGrupo || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    if (previewTab === 'plans') {
      return (
        <div className="finance-import-table-scroll" role="region" aria-label="Pré-visualização dos planos">
          <table className="finance-import-data-table">
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Valor</th>
                <th scope="col">Duração</th>
              </tr>
            </thead>
            <tbody>
              {parsed.plans.map((row, idx) => {
                const invalid = isPlanRowInvalid(row);
                return (
                  <tr key={`${row.name || 'pl'}-${idx}`} className={invalid ? 'finance-import-row--warn' : undefined}>
                    <td>
                      {invalid ? <AlertTriangle size={14} className="finance-import-row-icon" aria-hidden /> : null}
                      {row.name || '—'}
                    </td>
                    <td>{Number.isFinite(Number(row.price)) ? `R$ ${Number(row.price).toFixed(2)}` : '—'}</td>
                    <td>{row.durationDays || 30} dias</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    }

    return (
      <div className="finance-import-table-scroll" role="region" aria-label="Pré-visualização das contas bancárias">
        <table className="finance-import-data-table">
          <thead>
            <tr>
              <th scope="col">Banco</th>
              <th scope="col">Agência</th>
              <th scope="col">Conta</th>
              <th scope="col">PIX</th>
            </tr>
          </thead>
          <tbody>
            {parsed.bankAccounts.map((row, idx) => {
              const invalid = isBankRowInvalid(row);
              return (
                <tr key={`${row.bankName || 'bank'}-${idx}`} className={invalid ? 'finance-import-row--warn' : undefined}>
                  <td>
                    {invalid ? <AlertTriangle size={14} className="finance-import-row-icon" aria-hidden /> : null}
                    {row.bankName || '—'}
                  </td>
                  <td>{row.branch || '—'}</td>
                  <td>{row.account || '—'}</td>
                  <td>{row.pixKey || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      className="finance-import-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finance-import-title"
      aria-describedby="finance-import-desc"
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
    >
      <div className="finance-import-modal">
        {showProgressBar ? (
          <div className="finance-import-progress" aria-hidden="true">
            <div className="finance-import-progress-bar" />
          </div>
        ) : null}

        <header className="finance-import-header">
          <div>
            <h2 id="finance-import-title" className="finance-import-title">
              Importar configurações financeiras
            </h2>
            {step === 'upload' ? (
              <p id="finance-import-desc" className="finance-import-subtitle">
                Envie Excel ou CSV com plano de contas, planos de pagamento ou contas bancárias.
              </p>
            ) : null}
          </div>
          <button type="button" className="finance-import-icon-btn" onClick={requestClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="finance-import-body">
          {step === 'upload' && (
            <>
              <div
                className={`finance-import-dropzone${dragOver ? ' finance-import-dropzone--drag' : ''}${error ? ' finance-import-dropzone--error' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    fileRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Selecionar ou arrastar planilha Excel ou CSV"
              >
                {isParseError ? (
                  <div className="finance-import-error-banner" role="alert">
                    <AlertTriangle size={18} aria-hidden />
                    <div className="finance-import-error-banner-text">
                      <strong>Não consegui interpretar essa planilha.</strong>
                      {errorHint && !errorHint.includes('Exportar plano') ? (
                        <span>{errorHint}</span>
                      ) : (
                        <span>Use o modelo do Nave ou verifique se o arquivo contém dados válidos.</span>
                      )}
                      <button
                        type="button"
                        className="finance-import-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadFinanceImportTemplate();
                        }}
                      >
                        Baixar planilha modelo do Nave
                      </button>
                    </div>
                  </div>
                ) : null}

                {selectedFile ? (
                  <div className="finance-import-file-chip" onClick={(e) => e.stopPropagation()}>
                    <FileSpreadsheet size={20} aria-hidden />
                    <span className="finance-import-file-name">{selectedFile.name}</span>
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
                    <p className="finance-import-drop-title">Clique ou arraste sua planilha aqui</p>
                    <p className="finance-import-drop-hint">Excel (.xlsx, .xls) ou CSV</p>
                  </>
                )}

                {error && !isParseError ? (
                  <div className="finance-import-inline-error" role="alert">
                    <AlertTriangle size={16} aria-hidden />
                    {error}
                  </div>
                ) : null}

                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileInput}
                  className="finance-import-file-input"
                  aria-hidden
                  tabIndex={-1}
                />
              </div>

              <button
                type="button"
                className="finance-import-template-btn"
                onClick={downloadFinanceImportTemplate}
              >
                Baixar planilha modelo
              </button>
            </>
          )}

          {(step === 'loading' || step === 'saving') && (
            <div className="finance-import-processing" role="status" aria-live="polite">
              <div className="finance-import-file-chip finance-import-file-chip--center">
                <FileSpreadsheet size={22} aria-hidden />
                <span className="finance-import-file-name">{selectedFile?.name || 'Planilha'}</span>
              </div>
              <PulsingDots />
              <p className="finance-import-processing-text">
                {step === 'saving' ? 'Importando dados...' : 'Interpretando sua planilha...'}
              </p>
            </div>
          )}

          {step === 'preview' && (
            <>
              {parsed?.summary ? <p className="finance-import-summary">{parsed.summary}</p> : null}

              {!canImport ? (
                <div className="finance-import-empty" role="status">
                  <div className="finance-import-empty-icon" aria-hidden>
                    <FileSpreadsheet size={48} strokeWidth={1.25} />
                  </div>
                  <h3 className="finance-import-empty-title">Nenhum dado identificado</h3>
                  <p className="finance-import-empty-desc">
                    Não encontramos plano de contas, planos ou contas bancárias neste arquivo. Baixe o modelo e tente
                    novamente.
                  </p>
                  <button type="button" className="finance-import-btn-primary" onClick={downloadFinanceImportTemplate}>
                    Baixar planilha modelo
                  </button>
                  <button
                    type="button"
                    className="finance-import-link"
                    onClick={() => {
                      setStep('upload');
                      setParsed(null);
                    }}
                  >
                    Enviar outro arquivo
                  </button>
                </div>
              ) : (
                <>
                  <div className="finance-import-tabs" role="tablist" aria-label="Categorias da importação">
                    {previewTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        id={`finance-import-tab-${tab.id}`}
                        aria-selected={previewTab === tab.id}
                        aria-controls={`finance-import-panel-${tab.id}`}
                        className={`finance-import-tab${previewTab === tab.id ? ' finance-import-tab--active' : ''}`}
                        onClick={() => setPreviewTab(tab.id)}
                      >
                        {tab.label}
                        <span className="finance-import-tab-badge">{tab.count}</span>
                      </button>
                    ))}
                  </div>

                  <div
                    id={`finance-import-panel-${previewTab}`}
                    role="tabpanel"
                    aria-labelledby={`finance-import-tab-${previewTab}`}
                    className="finance-import-panel"
                  >
                    {renderPreviewTable()}
                  </div>

                  {error ? (
                    <div className="finance-import-inline-error finance-import-inline-error--panel" role="alert">
                      <AlertTriangle size={16} aria-hidden />
                      {error}
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}

          {step === 'confirm-mode' && (
            <div className="finance-import-confirm-mode">
              <h3 className="finance-import-confirm-heading">Você já tem dados cadastrados</h3>
              <p className="finance-import-subtitle">Como deseja importar?</p>
              <div className="finance-import-mode-list">
                <button
                  type="button"
                  className={`finance-import-mode${mode === 'merge' ? ' finance-import-mode--active' : ''}`}
                  onClick={() => setMode('merge')}
                >
                  <span className="finance-import-mode-title">
                    <Check size={16} aria-hidden /> Adicionar aos existentes
                  </span>
                  <span className="finance-import-mode-desc">
                    Novos itens serão adicionados. Itens existentes não serão alterados.
                  </span>
                </button>
                <button
                  type="button"
                  className={`finance-import-mode finance-import-mode--danger${mode === 'replace' ? ' finance-import-mode--active' : ''}`}
                  onClick={() => setMode('replace')}
                >
                  <span className="finance-import-mode-title">
                    <RefreshCcw size={16} aria-hidden /> Substituir tudo
                  </span>
                  <span className="finance-import-mode-desc">
                    Todos os dados atuais serão removidos e substituídos pelos importados.
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <footer className="finance-import-footer">
          {step === 'upload' && (
            <button type="button" className="finance-import-btn-ghost" onClick={requestClose}>
              Cancelar
            </button>
          )}

          {step === 'loading' && (
            <button type="button" className="finance-import-btn-ghost" onClick={requestClose}>
              Cancelar
            </button>
          )}

          {step === 'preview' && (
            <>
              <button type="button" className="finance-import-btn-ghost" onClick={requestClose}>
                Cancelar
              </button>
              <button
                type="button"
                className="finance-import-btn-primary"
                disabled={!canImport}
                onClick={() => {
                  if (hasExistingData) setStep('confirm-mode');
                  else void handleConfirm('merge');
                }}
              >
                Confirmar importação
              </button>
            </>
          )}

          {step === 'confirm-mode' && (
            <>
              <button type="button" className="finance-import-btn-ghost" onClick={() => setStep('preview')}>
                Voltar
              </button>
              <button type="button" className="finance-import-btn-primary" onClick={() => void handleConfirm(mode)}>
                Confirmar
              </button>
            </>
          )}

          {step === 'saving' && (
            <button type="button" className="finance-import-btn-ghost" onClick={requestClose}>
              Cancelar
            </button>
          )}
        </footer>
      </div>

      <ConfirmDialog
        open={closeConfirmOpen}
        title="Cancelar importação?"
        description="A importação ainda está em andamento. Deseja cancelar?"
        confirmLabel="Cancelar importação"
        onConfirm={finishClose}
        onClose={() => setCloseConfirmOpen(false)}
      />

      <style dangerouslySetInnerHTML={{ __html: FINANCE_IMPORT_STYLES }} />
    </div>
  );
}

const FINANCE_IMPORT_STYLES = `
  .finance-import-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgba(0, 4, 53, 0.45);
    backdrop-filter: blur(4px);
    font-family: var(--ff-ui, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

  .finance-import-modal {
    position: relative;
    width: 100%;
    max-width: 600px;
    max-height: min(90vh, 720px);
    display: flex;
    flex-direction: column;
    background: var(--surface, #fff);
    border-radius: 16px;
    box-shadow: 0 24px 48px rgba(0, 4, 53, 0.14), 0 4px 12px rgba(0, 4, 53, 0.08);
    overflow: hidden;
  }

  .finance-import-progress {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: rgba(0, 68, 102, 0.12);
    z-index: 2;
    overflow: hidden;
  }

  .finance-import-progress-bar {
    height: 100%;
    width: 40%;
    background: ${VIOLET};
    border-radius: 0 2px 2px 0;
    animation: finance-import-progress-slide 1.2s ease-in-out infinite;
  }

  @keyframes finance-import-progress-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }

  .finance-import-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 24px 24px 0;
    flex-shrink: 0;
  }

  .finance-import-title {
    margin: 0 0 6px;
    font-family: var(--ff-serif, 'Fraunces', Georgia, serif);
    font-size: 1.35rem;
    font-weight: 700;
    line-height: 1.25;
    color: var(--text-primary, var(--cosmos));
  }

  .finance-import-subtitle {
    margin: 0;
    font-size: 0.9rem;
    line-height: 1.45;
    color: var(--text-secondary, #5c5870);
  }

  .finance-import-icon-btn {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 10px;
    background: transparent;
    color: var(--text-secondary, #5c5870);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .finance-import-icon-btn:hover {
    background: rgba(0, 68, 102, 0.08);
    color: ${VIOLET};
  }

  .finance-import-icon-btn:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
  }

  .finance-import-body {
    padding: 20px 24px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .finance-import-dropzone {
    border: 2px dashed rgba(0, 68, 102, 0.4);
    border-radius: 14px;
    background: rgba(0, 68, 102, 0.04);
    padding: 36px 24px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, border-width 0.15s ease;
  }

  .finance-import-dropzone:hover {
    border-color: ${VIOLET};
    border-style: solid;
    background: rgba(0, 68, 102, 0.08);
  }

  .finance-import-dropzone:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 3px;
  }

  .finance-import-dropzone--drag {
    border-width: 3px;
    border-style: solid;
    border-color: ${VIOLET};
    background: rgba(0, 68, 102, 0.12);
  }

  .finance-import-dropzone--error {
    padding-top: 16px;
  }

  .finance-import-upload-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 72px;
    height: 72px;
    margin: 0 auto 14px;
    border-radius: 50%;
    background: rgba(0, 68, 102, 0.1);
    color: ${VIOLET};
  }

  .finance-import-drop-title {
    margin: 0 0 6px;
    font-size: 1rem;
    font-weight: 600;
    color: var(--text-primary, var(--cosmos));
  }

  .finance-import-drop-hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--text-secondary, #5c5870);
  }

  .finance-import-template-btn {
    display: block;
    width: fit-content;
    margin: 14px auto 0;
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: ${VIOLET};
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .finance-import-template-btn:hover {
    color: #4a32a3;
  }

  .finance-import-template-btn:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
    border-radius: 4px;
  }

  .finance-import-link {
    padding: 0;
    border: none;
    background: none;
    font-family: inherit;
    font-size: inherit;
    font-weight: 600;
    color: ${VIOLET};
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .finance-import-link:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
    border-radius: 4px;
  }

  .finance-import-error-banner {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    margin-bottom: 16px;
    padding: 12px 14px;
    border-radius: 10px;
    border: 1px solid ${CORAL};
    background: rgba(240, 64, 64, 0.08);
    color: #8b2e2e;
  }

  .finance-import-error-banner svg {
    flex-shrink: 0;
    color: ${CORAL};
    margin-top: 2px;
  }

  .finance-import-error-banner-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .finance-import-error-banner-text strong {
    color: var(--cosmos);
    font-weight: 700;
  }

  .finance-import-file-chip {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(0, 68, 102, 0.08);
    color: ${VIOLET};
  }

  .finance-import-file-chip--center {
    margin-bottom: 8px;
  }

  .finance-import-file-name {
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-primary, var(--cosmos));
    word-break: break-all;
  }

  .finance-import-file-change {
    font-size: 0.8rem;
  }

  .finance-import-file-input {
    display: none;
  }

  .finance-import-inline-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: 14px;
    font-size: 0.85rem;
    color: ${CORAL};
  }

  .finance-import-inline-error--panel {
    justify-content: flex-start;
    margin-top: 12px;
  }

  .finance-import-processing {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 24px 0;
  }

  .finance-import-processing-text {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-secondary, #5c5870);
  }

  .finance-import-dots {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: center;
  }

  .finance-import-dots span {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: ${VIOLET};
    animation: finance-import-dot-pulse 1.2s ease-in-out infinite;
  }

  .finance-import-dots span:nth-child(2) { animation-delay: 0.15s; }
  .finance-import-dots span:nth-child(3) { animation-delay: 0.3s; }

  @keyframes finance-import-dot-pulse {
    0%, 80%, 100% { opacity: 0.35; transform: scale(0.85); }
    40% { opacity: 1; transform: scale(1); }
  }

  .finance-import-summary {
    margin: 0 0 14px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(0, 68, 102, 0.08);
    border: 1px solid rgba(0, 68, 102, 0.2);
    font-size: 0.875rem;
    color: #3d2f93;
    line-height: 1.4;
  }

  .finance-import-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--border-light, #e8e8ef);
    padding-bottom: 0;
  }

  .finance-import-tab {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 4px 12px;
    margin-bottom: -1px;
    border: none;
    border-bottom: 2px solid transparent;
    background: none;
    font-family: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--text-secondary, #5c5870);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .finance-import-tab:hover {
    color: ${VIOLET};
  }

  .finance-import-tab:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
    border-radius: 4px;
  }

  .finance-import-tab--active {
    color: ${VIOLET};
    border-bottom-color: ${VIOLET};
  }

  .finance-import-tab-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 22px;
    height: 22px;
    padding: 0 7px;
    border-radius: 999px;
    background: rgba(0, 68, 102, 0.12);
    font-size: 0.75rem;
    font-weight: 700;
    color: ${VIOLET};
  }

  .finance-import-tab--active .finance-import-tab-badge {
    background: ${VIOLET};
    color: #fff;
  }

  .finance-import-panel {
    min-height: 160px;
  }

  .finance-import-table-scroll {
    max-height: min(42vh, 320px);
    overflow: auto;
    border: 1px solid var(--border-light, #e8e8ef);
    border-radius: 10px;
  }

  .finance-import-data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  .finance-import-data-table thead {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-hover, var(--azul-gelo));
  }

  .finance-import-data-table th {
    padding: 10px 12px;
    text-align: left;
    font-weight: 700;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-secondary, #5c5870);
    border-bottom: 1px solid var(--border-light, #e8e8ef);
    white-space: nowrap;
  }

  .finance-import-data-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-light, #e8e8ef);
    color: var(--text-primary, var(--cosmos));
    vertical-align: middle;
  }

  .finance-import-data-table tbody tr:nth-child(even) {
    background: rgba(0, 68, 102, 0.03);
  }

  .finance-import-data-table tbody tr:last-child td {
    border-bottom: none;
  }

  .finance-import-row--warn {
    background: rgba(240, 64, 64, 0.08) !important;
  }

  .finance-import-row--warn td {
    color: #8b2e2e;
  }

  .finance-import-row-icon {
    display: inline-block;
    vertical-align: -2px;
    margin-right: 6px;
    color: ${CORAL};
  }

  .finance-import-empty {
    text-align: center;
    padding: 28px 12px 12px;
  }

  .finance-import-empty-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 88px;
    height: 88px;
    margin-bottom: 16px;
    border-radius: 50%;
    background: rgba(0, 68, 102, 0.08);
    color: ${VIOLET};
  }

  .finance-import-empty-title {
    margin: 0 0 8px;
    font-family: var(--ff-serif, 'Fraunces', Georgia, serif);
    font-size: 1.15rem;
    font-weight: 700;
    color: var(--text-primary, var(--cosmos));
  }

  .finance-import-empty-desc {
    margin: 0 auto 18px;
    max-width: 360px;
    font-size: 0.9rem;
    line-height: 1.5;
    color: var(--text-secondary, #5c5870);
  }

  .finance-import-empty .finance-import-btn-primary {
    margin-bottom: 12px;
  }

  .finance-import-confirm-mode {
    padding: 4px 0;
  }

  .finance-import-confirm-heading {
    margin: 0 0 6px;
    font-family: var(--ff-serif, 'Fraunces', Georgia, serif);
    font-size: 1.1rem;
    font-weight: 700;
  }

  .finance-import-mode-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }

  .finance-import-mode {
    text-align: left;
    border: 1px solid var(--border-light, #e8e8ef);
    border-radius: 12px;
    background: var(--surface, #fff);
    padding: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .finance-import-mode:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
  }

  .finance-import-mode--active {
    border-color: ${VIOLET};
    box-shadow: 0 0 0 2px rgba(0, 68, 102, 0.15);
  }

  .finance-import-mode--danger.finance-import-mode--active {
    border-color: ${CORAL};
    box-shadow: 0 0 0 2px rgba(240, 64, 64, 0.15);
  }

  .finance-import-mode-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 0.9rem;
    color: var(--text-primary, var(--cosmos));
    margin-bottom: 6px;
  }

  .finance-import-mode-desc {
    display: block;
    font-size: 0.85rem;
    color: var(--text-secondary, #5c5870);
    line-height: 1.4;
  }

  .finance-import-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 16px 24px 24px;
    flex-shrink: 0;
    border-top: 1px solid var(--border-light, #e8e8ef);
    background: var(--surface, #fff);
  }

  .finance-import-btn-ghost {
    padding: 10px 18px;
    border: none;
    border-radius: 10px;
    background: transparent;
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 600;
    color: var(--text-secondary, #5c5870);
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .finance-import-btn-ghost:hover {
    background: rgba(0, 68, 102, 0.08);
    color: ${VIOLET};
  }

  .finance-import-btn-ghost:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
  }

  .finance-import-btn-primary {
    padding: 10px 20px;
    border: none;
    border-radius: 10px;
    background: ${VIOLET};
    font-family: inherit;
    font-size: 0.9rem;
    font-weight: 700;
    color: #fff;
    cursor: pointer;
    transition: opacity 0.15s ease, transform 0.1s ease;
  }

  .finance-import-btn-primary:hover:not(:disabled) {
    opacity: 0.92;
  }

  .finance-import-btn-primary:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .finance-import-btn-primary:focus-visible {
    outline: 2px solid ${VIOLET};
    outline-offset: 2px;
  }
`;
