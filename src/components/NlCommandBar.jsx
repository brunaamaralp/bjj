import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useNlAction } from '../hooks/useNlAction';

function formatRefMonth(ym) {
  if (!ym) return '—';
  try {
    const s = String(ym).trim();
    const cap = new Date(`${s}-02`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return cap.replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    return ym;
  }
}

export function NlCommandBarTrigger({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: 'var(--surface)',
        border: '0.5px solid var(--border-light)',
        borderRadius: 10,
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 13,
        color: '#aaa',
        transition: 'all 0.15s'
      }}
    >
      <span style={{ color: '#5B3FBF', fontSize: 16 }}>✦</span>
      <span style={{ flex: 1, textAlign: 'left' }}>O que você quer fazer?</span>
      <kbd
        style={{
          fontSize: 10,
          color: '#bbb',
          background: '#f5f5f5',
          border: '0.5px solid #ddd',
          borderRadius: 4,
          padding: '2px 6px',
          fontFamily: 'inherit'
        }}
      >
        ⌘K
      </kbd>
    </button>
  );
}

/**
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, academyName?: string, context?: 'financeiro'|'funil'|'perfil', pipelineStages?: { id: string, label?: string }[], pendingTransactions?: object[], recentPayments?: object[] }} props
 */
export default function NlCommandBar({
  open,
  onOpenChange,
  academyName: academyNameProp,
  context = 'financeiro',
  pipelineStages = [],
  pendingTransactions = [],
  recentPayments = []
}) {
  const [state, setState] = useState('idle');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const { interpret, execute, academyName: academyNameFromHook } = useNlAction();
  const academyName = String(academyNameProp || academyNameFromHook || '').trim();
  const inputRef = useRef(null);

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        const tag = String(e.target?.tagName || '').toLowerCase();
        const inField = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
        if (!open && inField) return;
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === 'Escape') {
        if (state !== 'loading' && state !== 'executing') {
          onOpenChange(false);
        }
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange, state]);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setState('idle');
        setText('');
        setParsed(null);
        setErrorMsg('');
      }, 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    if (open && inputRef.current && (state === 'idle' || state === 'error')) {
      const t = requestAnimationFrame(() => {
        try {
          inputRef.current?.focus();
        } catch {
          void 0;
        }
      });
      return () => cancelAnimationFrame(t);
    }
    return undefined;
  }, [open, state]);

  const handleInterpret = useCallback(async () => {
    if (!text.trim()) return;
    setState('loading');
    setErrorMsg('');
    try {
      const result = await interpret(text.trim(), context, { pipelineStages, pendingTransactions, recentPayments });
      setParsed(result);
      setState('confirm');
    } catch (err) {
      setErrorMsg(err?.message || 'Erro ao conectar. Tente novamente.');
      setState('error');
    }
  }, [text, interpret, context, pipelineStages, pendingTransactions, recentPayments]);

  const handleExecute = useCallback(async () => {
    if (!parsed || parsed.action == null) return;
    setState('executing');
    setErrorMsg('');
    try {
      await execute(parsed);
      setState('success');
      setTimeout(() => onOpenChange(false), 2500);
    } catch (err) {
      setErrorMsg(err?.message || 'Erro ao executar a ação.');
      setState('error');
    }
  }, [parsed, execute, onOpenChange]);

  const inputDisabled = state === 'loading' || state === 'executing' || state === 'success';
  const missingBlock = Array.isArray(parsed?.missing) && parsed.missing.length > 0;
  const canConfirm =
    parsed &&
    parsed.action != null &&
    !missingBlock &&
    (
      parsed.action === 'register_payment' ||
      parsed.action === 'register_expense' ||
      parsed.action === 'add_note' ||
      parsed.action === 'mark_attended' ||
      parsed.action === 'mark_missed' ||
      parsed.action === 'register_whatsapp' ||
      parsed.action === 'mark_enrolled' ||
      parsed.action === 'mark_lost' ||
      parsed.action === 'schedule_experimental' ||
      parsed.action === 'move_pipeline_stage' ||
      parsed.action === 'register_checkin' ||
      parsed.action === 'update_student' ||
      parsed.action === 'create_lead' ||
      parsed.action === 'settle_transaction' ||
      parsed.action === 'update_payment'
    );

  return (
    <>
      <style>{`
        @keyframes nl-cmd-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div
        role="presentation"
        onClick={() => {
          if (state !== 'loading' && state !== 'executing') onOpenChange(false);
        }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10,10,20,0.5)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '15vh',
          zIndex: 200,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.2s'
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assistente de comandos"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            width: 'min(560px, calc(100vw - 32px))',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)',
            transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            transition: 'transform 0.2s',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              borderBottom: '0.5px solid var(--border-light)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span style={{ color: '#5B3FBF', fontSize: 18 }} aria-hidden>
              ✦
            </span>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={inputDisabled}
              placeholder="Descreva o que deseja fazer…"
              style={{
                flex: 1,
                border: 'none',
                outline: 'none',
                fontSize: 16,
                background: 'transparent',
                color: 'var(--text)',
                fontFamily: 'inherit'
              }}
            />
            {text && state === 'idle' ? (
              <button
                type="button"
                aria-label="Limpar"
                onClick={() => setText('')}
                style={{
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 18,
                  lineHeight: 1,
                  padding: 4
                }}
              >
                ✕
              </button>
            ) : null}
          </div>

          {state === 'idle' ? (
            <div style={{ padding: 20 }}>
              <button
                type="button"
                disabled={!text.trim()}
                onClick={() => void handleInterpret()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#5B3FBF',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: text.trim() ? 'pointer' : 'not-allowed',
                  opacity: text.trim() ? 1 : 0.5,
                  fontFamily: 'inherit'
                }}
              >
                Interpretar comando
              </button>
            </div>
          ) : null}

          {state === 'loading' ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  margin: '0 auto 14px',
                  border: '2px solid #EEEDFE',
                  borderTopColor: '#5B3FBF',
                  borderRadius: '50%',
                  animation: 'nl-cmd-spin 0.7s linear infinite'
                }}
              />
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Interpretando seu comando…</div>
            </div>
          ) : null}

          {state === 'executing' ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  margin: '0 auto 14px',
                  border: '2px solid #EEEDFE',
                  borderTopColor: '#5B3FBF',
                  borderRadius: '50%',
                  animation: 'nl-cmd-spin 0.7s linear infinite'
                }}
              />
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Executando…</div>
            </div>
          ) : null}

          {state === 'confirm' && parsed && parsed.action != null ? (
            <div style={{ padding: 20 }}>
              {parsed.confidence === 'low' ? (
                <div
                  style={{
                    marginBottom: 12,
                    padding: '10px 12px',
                    borderRadius: 8,
                    background: '#fbf6ea',
                    color: '#8a6b1a',
                    fontSize: 13,
                    fontWeight: 600
                  }}
                >
                  ⚠ Verifique os dados — baixa confiança
                </div>
              ) : null}
              {missingBlock ? (
                <div style={{ marginBottom: 12, fontSize: 13, color: '#A32D2D', fontWeight: 600 }}>
                  Faltam: {parsed.missing.join(', ')}
                </div>
              ) : null}
              <div style={{ background: '#EEEDFE', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: '#5B3FBF', letterSpacing: '0.08em', marginBottom: 8 }}>
                  ✦ AÇÃO IDENTIFICADA
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{parsed.summary}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {parsed.action === 'register_payment' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno(a):</strong>{' '}
                        {parsed.data?.student_name || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Mês:</strong> {formatRefMonth(parsed.data?.reference_month)}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Valor:</strong>{' '}
                        {parsed.data?.amount != null && parsed.data?.amount !== '' ? (
                          String(parsed.data.amount)
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Não mencionado · usar valor habitual</span>
                        )}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Método:</strong>{' '}
                        {parsed.data?.method ? (
                          String(parsed.data.method)
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Não mencionado · usar valor habitual</span>
                        )}
                      </li>
                    </>
                  ) : parsed.action === 'add_note' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead/Aluno:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.student_name || parsed.data?.lead_id || parsed.data?.student_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Nota:</strong> {parsed.data?.note_text || '—'}
                      </li>
                    </>
                  ) : parsed.action === 'register_expense' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Descrição:</strong>{' '}
                        {parsed.data?.expense_description || parsed.data?.description || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Valor (R$):</strong>{' '}
                        {parsed.data?.amount != null && parsed.data?.amount !== '' ? String(parsed.data.amount) : '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Método:</strong>{' '}
                        {parsed.data?.method ? String(parsed.data.method) : 'dinheiro (padrão)'}
                      </li>
                    </>
                  ) : parsed.action === 'register_checkin' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno(a):</strong>{' '}
                        {parsed.data?.student_name || parsed.data?.student_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Registro:</strong> Check-in agora (presença)
                      </li>
                    </>
                  ) : parsed.action === 'update_student' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno(a):</strong>{' '}
                        {parsed.data?.student_name || parsed.data?.student_id || '—'}
                      </li>
                      {Object.entries(parsed.data?.updates || {}).map(([k, v]) => (
                        <li key={k}>
                          <strong style={{ color: 'var(--text)' }}>{k}:</strong> {String(v)}
                        </li>
                      ))}
                    </>
                  ) : parsed.action === 'settle_transaction' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Transação:</strong>{' '}
                        {parsed.data?.transaction_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Nota:</strong>{' '}
                        {String(parsed.data?.tx_snapshot?.note || '').slice(0, 120) || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Bruto:</strong>{' '}
                        {parsed.data?.tx_snapshot?.gross != null ? String(parsed.data.tx_snapshot.gross) : '—'}
                      </li>
                    </>
                  ) : parsed.action === 'update_payment' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Registro:</strong>{' '}
                        {parsed.data?.payment_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno(a):</strong>{' '}
                        {parsed.data?.student_name || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Mês:</strong> {formatRefMonth(parsed.data?.reference_month)}
                      </li>
                      {Object.entries(parsed.data?.updates || {}).map(([k, v]) => (
                        <li key={k}>
                          <strong style={{ color: 'var(--text)' }}>{k}:</strong> {String(v)}
                        </li>
                      ))}
                    </>
                  ) : parsed.action === 'create_lead' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Nome:</strong>{' '}
                        {parsed.data?.name || parsed.data?.lead_name || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Telefone:</strong>{' '}
                        {parsed.data?.phone || parsed.data?.lead_phone || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Origem:</strong>{' '}
                        {parsed.data?.origin ? String(parsed.data.origin) : '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Tipo:</strong> {parsed.data?.type || 'Adulto'}
                      </li>
                    </>
                  ) : parsed.action === 'mark_enrolled' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Resultado:</strong> Status matriculado · tipo aluno
                      </li>
                    </>
                  ) : parsed.action === 'schedule_experimental' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Data:</strong>{' '}
                        {parsed.data?.scheduled_date || parsed.data?.date || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Horário:</strong>{' '}
                        {parsed.data?.scheduled_time || parsed.data?.time || '—'}
                      </li>
                    </>
                  ) : parsed.action === 'move_pipeline_stage' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Nova etapa:</strong>{' '}
                        {(() => {
                          const tid = String(parsed.data?.target_stage_id || parsed.data?.stage_id || '').trim();
                          const st = (pipelineStages || []).find((x) => String(x.id) === tid);
                          return st?.label ? `${st.label} (${tid})` : tid || '—';
                        })()}
                      </li>
                    </>
                  ) : parsed.action === 'mark_attended' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Nova etapa:</strong> Aguardando decisão
                      </li>
                    </>
                  ) : parsed.action === 'mark_missed' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Motivo:</strong>{' '}
                        {parsed.data?.reason ? String(parsed.data.reason) : 'não informado'}
                      </li>
                    </>
                  ) : parsed.action === 'mark_lost' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Motivo da perda:</strong>{' '}
                        {parsed.data?.lost_reason ? String(parsed.data.lost_reason) : '—'}
                      </li>
                    </>
                  ) : parsed.action === 'register_whatsapp' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Lead:</strong>{' '}
                        {parsed.data?.lead_name || parsed.data?.lead_id || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Mensagem:</strong>{' '}
                        {parsed.data?.message_description ? String(parsed.data.message_description) : 'não especificada'}
                      </li>
                    </>
                  ) : (
                    <li style={{ color: 'var(--text-muted)' }}>Revise o resumo acima antes de confirmar.</li>
                  )}
                </ul>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'var(--text)'
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => void handleExecute()}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#5B3FBF',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                    opacity: canConfirm ? 1 : 0.5,
                    fontFamily: 'inherit'
                  }}
                >
                  Confirmar e executar
                </button>
              </div>
            </div>
          ) : null}

          {state === 'confirm' && parsed && parsed.action == null ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden>
                🤔
              </div>
              <div style={{ fontSize: 14, color: '#A32D2D', lineHeight: 1.5, marginBottom: 16 }}>{parsed.error || 'Não foi possível interpretar.'}</div>
              <button
                type="button"
                onClick={() => {
                  setState('idle');
                  setParsed(null);
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          {state === 'success' ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }} aria-hidden>
                ✅
              </div>
              <div style={{ fontSize: 16, fontWeight: 600, color: '#3B6D11', marginBottom: 6 }}>Concluído!</div>
              <div style={{ fontSize: 13, color: '#888' }}>{parsed?.summary || ''}</div>
            </div>
          ) : null}

          {state === 'error' ? (
            <div style={{ padding: 24, textAlign: 'center' }}>
              <AlertCircle size={36} color="#A32D2D" style={{ margin: '0 auto 12px' }} aria-hidden />
              <div style={{ fontSize: 14, color: '#A32D2D', lineHeight: 1.5, marginBottom: 16 }}>{errorMsg}</div>
              <button
                type="button"
                onClick={() => {
                  if (parsed && parsed.action != null) setState('confirm');
                  else setState('idle');
                }}
                style={{
                  padding: '10px 20px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit'
                }}
              >
                Tentar novamente
              </button>
            </div>
          ) : null}

          <div
            style={{
              padding: '10px 20px',
              background: 'var(--surface-hover, #fafafa)',
              borderTop: '0.5px solid var(--border-light)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 11,
              color: '#bbb'
            }}
          >
            <span>
              {context === 'funil' ? 'Funil de Vendas' : context === 'perfil' ? 'Perfil (finanças + funil)' : 'Módulo Financeiro'}
              {academyName ? ` · ${academyName}` : ''}
            </span>
            <kbd
              style={{
                fontSize: 10,
                color: '#bbb',
                background: '#f0f0f0',
                border: '0.5px solid #ddd',
                borderRadius: 4,
                padding: '2px 6px',
                fontFamily: 'inherit'
              }}
            >
              ESC
            </kbd>
          </div>
        </div>
      </div>
    </>
  );
}
