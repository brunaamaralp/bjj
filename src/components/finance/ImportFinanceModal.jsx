import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, Check, ChevronDown, ChevronUp, Loader2, RefreshCcw, Upload, X } from 'lucide-react';
import { createSessionJwt } from '../../lib/appwrite';

const emptyExpanded = { accounts: true, plans: true, bankAccounts: true };

function hasAnyData(parsed) {
  if (!parsed) return false;
  return (parsed.accounts?.length || 0) > 0 || (parsed.plans?.length || 0) > 0 || (parsed.bankAccounts?.length || 0) > 0;
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
  const [expandedSections, setExpandedSections] = useState(emptyExpanded);
  const [mode, setMode] = useState('merge');

  const canImport = useMemo(() => hasAnyData(parsed), [parsed]);
  if (!open) return null;

  const resetState = () => {
    setStep('upload');
    setParsed(null);
    setError('');
    setExpandedSections(emptyExpanded);
    setMode('merge');
  };

  const handleClose = () => {
    if (step === 'loading' || step === 'saving') return;
    resetState();
    onClose?.();
  };

  const handleToggleSection = (key) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const jsonRows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        if (!Array.isArray(jsonRows) || jsonRows.length === 0) {
          setError('A planilha está vazia.');
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
          throw new Error(data.error);
        }

        setParsed({
          accounts: Array.isArray(data.accounts) ? data.accounts : [],
          plans: Array.isArray(data.plans) ? data.plans : [],
          bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : [],
          summary: String(data.summary || '').trim(),
        });
        setStep('preview');
      } catch (err) {
        setError(err?.message || 'Erro ao ler o arquivo. Verifique o formato.');
        setStep('upload');
      } finally {
        if (fileRef.current) fileRef.current.value = '';
      }
    };

    reader.onerror = () => {
      setError('Erro ao ler o arquivo. Verifique o formato.');
      setStep('upload');
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsArrayBuffer(file);
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

  return (
    <div className="import-overlay">
      <div className="import-modal import-finance-modal">
        <div className="import-header">
          <h3 className="navi-section-heading" style={{ fontSize: '1.05rem' }}>
            Importar configurações financeiras
          </h3>
          <button className="icon-btn" onClick={handleClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="import-body">
          {step === 'upload' && (
            <>
              <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 14 }}>
                Envie uma planilha Excel ou CSV com seu plano de contas, planos de pagamento ou contas bancárias.
              </p>
              <div className="upload-zone" onClick={() => fileRef.current?.click()}>
                <Upload size={32} color="var(--accent)" style={{ marginBottom: 10 }} />
                <p style={{ fontWeight: 600, margin: 0 }}>Clique para selecionar ou arraste o arquivo</p>
                <p className="navi-subtitle" style={{ marginTop: 8 }}>Excel (.xlsx, .xls) ou CSV</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </div>
              {error ? (
                <div className="import-error mt-3">
                  <AlertCircle size={16} /> {error}
                </div>
              ) : null}
            </>
          )}

          {step === 'loading' && (
            <div className="finance-import-center">
              <Loader2 className="spin" size={24} />
              <p>Analisando planilha com IA...</p>
            </div>
          )}

          {step === 'preview' && (
            <>
              {parsed?.summary ? (
                <div className="finance-import-summary">{parsed.summary}</div>
              ) : null}

              {!canImport ? (
                <div className="finance-import-empty">
                  <p>Nenhuma informação financeira identificada na planilha. Tente um arquivo diferente.</p>
                  <button className="btn-secondary" onClick={() => setStep('upload')}>
                    <RefreshCcw size={16} /> Tentar novamente
                  </button>
                </div>
              ) : (
                <div className="flex-col" style={{ gap: 10 }}>
                  {(parsed?.accounts?.length || 0) > 0 ? (
                    <section className="finance-import-section">
                      <button className="finance-import-section-header" onClick={() => handleToggleSection('accounts')}>
                        <span>Plano de contas · {parsed.accounts.length} contas</span>
                        {expandedSections.accounts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {expandedSections.accounts ? (
                        <div className="finance-import-table-wrap">
                          <table className="finance-table">
                            <thead>
                              <tr>
                                <th>Código</th>
                                <th>Nome</th>
                                <th>Tipo</th>
                                <th>DRE</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parsed.accounts.map((a, idx) => (
                                <tr key={`${a.code || 'acc'}-${idx}`}>
                                  <td>{a.code || '-'}</td>
                                  <td>{a.name || '-'}</td>
                                  <td>{a.type || '-'}</td>
                                  <td>{a.dreGrupo || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {(parsed?.plans?.length || 0) > 0 ? (
                    <section className="finance-import-section">
                      <button className="finance-import-section-header" onClick={() => handleToggleSection('plans')}>
                        <span>Planos · {parsed.plans.length} planos</span>
                        {expandedSections.plans ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {expandedSections.plans ? (
                        <div className="finance-import-list">
                          {parsed.plans.map((p, idx) => (
                            <div key={`${p.name || 'pl'}-${idx}`} className="finance-import-list-item">
                              <strong>{p.name || 'Plano sem nome'}</strong>
                              <span>R$ {Number(p.price || 0).toFixed(2)} · {p.durationDays || 30} dias</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}

                  {(parsed?.bankAccounts?.length || 0) > 0 ? (
                    <section className="finance-import-section">
                      <button className="finance-import-section-header" onClick={() => handleToggleSection('bankAccounts')}>
                        <span>Contas bancárias · {parsed.bankAccounts.length} contas</span>
                        {expandedSections.bankAccounts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                      {expandedSections.bankAccounts ? (
                        <div className="finance-import-list">
                          {parsed.bankAccounts.map((b, idx) => (
                            <div key={`${b.bankName || 'bank'}-${idx}`} className="finance-import-list-item">
                              <strong>{b.bankName || 'Banco não informado'}</strong>
                              <span>PIX: {b.pixKey || '—'}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </section>
                  ) : null}
                </div>
              )}

              {error ? (
                <div className="import-error mt-3">
                  <AlertCircle size={16} /> {error}
                </div>
              ) : null}
            </>
          )}

          {step === 'confirm-mode' && (
            <>
              <p className="navi-section-heading" style={{ marginTop: 0, marginBottom: 4 }}>Você já tem dados cadastrados</p>
              <p className="navi-subtitle" style={{ marginTop: 0, marginBottom: 12 }}>Como deseja importar?</p>
              <div className="flex-col" style={{ gap: 10 }}>
                <button className={`finance-import-mode ${mode === 'merge' ? 'active' : ''}`} onClick={() => setMode('merge')}>
                  <div className="finance-import-mode-title"><Check size={16} /> Adicionar aos existentes</div>
                  <p>Novos itens serão adicionados. Itens existentes não serão alterados.</p>
                </button>
                <button className={`finance-import-mode finance-import-mode--danger ${mode === 'replace' ? 'active' : ''}`} onClick={() => setMode('replace')}>
                  <div className="finance-import-mode-title"><RefreshCcw size={16} /> Substituir tudo</div>
                  <p>Todos os dados atuais serão removidos e substituídos pelos importados.</p>
                </button>
              </div>
            </>
          )}

          {step === 'saving' && (
            <div className="finance-import-center">
              <Loader2 className="spin" size={24} />
              <p>Importando dados...</p>
            </div>
          )}
        </div>

        <div className="import-footer">
          {step === 'upload' ? (
            <button className="btn-outline" style={{ flex: 1 }} onClick={handleClose}>Cancelar</button>
          ) : null}

          {step === 'preview' ? (
            <>
              <button className="btn-outline" style={{ flex: 1 }} onClick={handleClose}>Cancelar</button>
              <button
                className="btn-secondary"
                style={{ flex: 1.3 }}
                disabled={!canImport}
                onClick={() => {
                  if (hasExistingData) setStep('confirm-mode');
                  else void handleConfirm('merge');
                }}
              >
                Importar dados <ChevronDown size={16} style={{ transform: 'rotate(-90deg)' }} />
              </button>
            </>
          ) : null}

          {step === 'confirm-mode' ? (
            <>
              <button className="btn-outline" style={{ flex: 1 }} onClick={() => setStep('preview')}>Voltar</button>
              <button className="btn-secondary" style={{ flex: 1.3 }} onClick={() => void handleConfirm(mode)}>Confirmar</button>
            </>
          ) : null}
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .import-finance-modal { max-width: 760px; }
        .finance-import-center { min-height: 180px; display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; color:var(--text-secondary); }
        .finance-import-center .spin { animation: spin 1s linear infinite; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .finance-import-summary { background: #EEEDFE; border: 1px solid #d9d5ff; color: #3d2f93; padding: 12px 14px; border-radius: 12px; font-size: 0.92rem; margin-bottom: 10px; }
        .finance-import-section { border: 1px solid var(--border-light); border-radius: 12px; overflow: hidden; background: var(--surface); }
        .finance-import-section-header { width: 100%; border: 0; background: var(--surface-hover); padding: 11px 12px; display:flex; align-items:center; justify-content:space-between; font-weight: 600; cursor:pointer; }
        .finance-import-table-wrap { overflow-x: auto; }
        .finance-import-list { padding: 10px 12px; display:flex; flex-direction:column; gap:8px; }
        .finance-import-list-item { border: 1px solid var(--border-light); border-radius: 10px; padding: 8px 10px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; }
        .finance-import-empty { border:1px dashed var(--border); border-radius:12px; padding:16px; text-align:center; color:var(--text-secondary); display:flex; flex-direction:column; gap:10px; align-items:center; }
        .finance-import-mode { text-align:left; border:1px solid var(--border-light); border-radius:12px; background:var(--surface); padding:12px; cursor:pointer; }
        .finance-import-mode.active { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent-light); }
        .finance-import-mode--danger { border-color: rgba(225,93,75,0.4); }
        .finance-import-mode--danger.active { border-color: var(--danger); box-shadow: 0 0 0 2px rgba(225,93,75,0.14); }
        .finance-import-mode-title { font-weight: 700; display:flex; align-items:center; gap:8px; margin-bottom: 6px; }
        .finance-import-mode p { margin: 0; color: var(--text-secondary); font-size: 0.9rem; }
      ` }} />
    </div>
  );
}
