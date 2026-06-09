import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useNlAction } from '../hooks/useNlAction';
import { useTerms } from '../lib/terminology.js';
import {
  buildPaymentPrefillFromParsed,
  buildSalePrefillFromParsed,
  dispatchNlPaymentPrefill,
  dispatchNlSalePrefill,
} from '../lib/nlCorrect.js';
import { paymentFormLabel } from '../lib/salePayments.js';
import NlResponseMarkdown from './NlResponseMarkdown.jsx';
import { buildNlQuerySummary, nlQueryMarkdownBody } from '../lib/nlQuerySummary.js';

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

function formatBrl(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  } catch {
    return `R$ ${n.toFixed(2)}`.replace('.', ',');
  }
}

const PAYMENT_METHOD_LABELS = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartão_débito: 'Cartão débito',
  cartão_crédito: 'Cartão crédito',
  transferência: 'Transferência',
};

function formatNlPaymentMethod(method) {
  const k = String(method || '').trim().toLowerCase();
  return PAYMENT_METHOD_LABELS[k] || (k ? k : '—');
}

export function NlCommandBarTrigger({ onClick }) {
  const label = 'Pergunte ou descreva uma ação…';
  const title =
    'Consultas e comandos: matrículas, mensalidades, funil, caixa ou estoque (⌘K / Ctrl+K)';
  return (
    <button type="button" className="nl-command-bar-trigger" onClick={onClick} title={title}>
      <span className="nl-command-bar-trigger__icon" aria-hidden>
        ✦
      </span>
      <span className="nl-command-bar-trigger__label">{label}</span>
      <kbd className="nl-command-bar-trigger__kbd">⌘K</kbd>
    </button>
  );
}

const ASK_SUGGESTIONS = [
  'Quem fez matrícula esse mês?',
  'Quem ainda não pagou?',
  'Quem veio hoje?',
  'Tarefas atrasadas',
  'Quanto entrou esse mês?',
  'O João está em dia?',
];

const ACTION_SUGGESTIONS = [
  'Registrar pagamento do João em março',
  'Marcar lead como compareceu',
  'Registrar venda de rashguard',
];

const ASK_HELP_SECTIONS = [
  {
    title: 'Alunos e mensalidades',
    examples: ['Quem fez matrícula esse mês?', 'Quem ainda não pagou?', 'Quem está inadimplente?'],
  },
  {
    title: 'Funil',
    examples: [
      'Quantos leads novos essa semana?',
      'Quem compareceu à experimental?',
      'Quem tem experimental agendada?',
      'Quem faltou na experimental?',
      'Quem perdemos esse mês?',
      'Quem está em aguardando decisão?',
    ],
  },
  {
    title: 'Caixa e estoque',
    examples: ['Quanto entrou esse mês?', 'O que mais vendeu esse mês?', 'Quais produtos estão parados?'],
  },
  {
    title: 'Consultas pontuais',
    examples: ['O João está em dia?', 'Quem veio hoje?', 'Tarefas atrasadas'],
  },
  {
    title: 'Pré-requisitos de comandos',
    examples: [
      'Liquidar transação: cite a nota ou valor do lançamento pendente',
      'Editar mensalidade: informe aluno e mês',
      'Check-in: presença precisa estar configurada na academia',
    ],
  },
];

function isReadOnlyQueryAction(action) {
  return action === 'inventory_query' || action === 'academy_query';
}

/**
 * @param {{ open: boolean, onOpenChange: (open: boolean) => void, academyName?: string, context?: 'financeiro'|'funil'|'perfil'|'vendas', pipelineStages?: { id: string, label?: string }[], pendingTransactions?: object[], recentPayments?: object[], onCorrect?: (parsed: object) => void }} props
 */
export default function NlCommandBar({
  open,
  onOpenChange,
  academyName: academyNameProp,
  context = 'financeiro',
  pipelineStages = [],
  pendingTransactions = [],
  recentPayments = [],
  onCorrect,
}) {
  const [state, setState] = useState('idle');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showAskHelp, setShowAskHelp] = useState(false);
  const { interpret, execute, academyName: academyNameFromHook } = useNlAction();
  const terms = useTerms();
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
      if (isReadOnlyQueryAction(result?.action)) {
        setState('result');
      } else if (result?.action == null) {
        setState('confirm');
      } else {
        setState('confirm');
      }
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
      const result = await execute(parsed);
      let successSummary = parsed.summary || '';
      if (parsed.action === 'register_payment') {
        const name = parsed.data?.student_name || 'Aluno';
        const ref = formatRefMonth(parsed.data?.reference_month);
        successSummary = `Pagamento de ${ref} registrado para ${name} ✓`;
      }
      if (parsed.action === 'register_sale' && result?.receipt_summary) {
        const r = result.receipt_summary;
        successSummary = `Venda registrada: ${r.product} · ${formatBrl(r.total)} · ${paymentFormLabel(r.payment_form)}`;
      }
      if (parsed.action === 'adjust_stock' && result?.toast_message) {
        successSummary = result.toast_message;
      }
      if (parsed.action === 'inventory_query' && result?.resposta) {
        successSummary = result.resposta;
      }
      if (parsed.action === 'academy_query' && result?.resposta) {
        successSummary = result.resposta.split('\n')[0] || parsed.summary || '';
      }
      if (parsed.action === 'register_expense') {
        successSummary = `Despesa registrada: ${parsed.data?.expense_description || parsed.summary || 'ok'} ✓`;
      }
      if (parsed.action === 'register_checkin') {
        successSummary = `Check-in registrado para ${parsed.data?.student_name || 'aluno'} ✓`;
      }
      if (parsed.action === 'update_student') {
        successSummary = `Dados de ${parsed.data?.student_name || 'aluno'} atualizados ✓`;
      }
      if (parsed.action === 'update_payment') {
        successSummary = `Mensalidade atualizada ✓`;
      }
      if (parsed.action === 'mark_attended') {
        successSummary = `${parsed.data?.lead_name || 'Lead'} marcado como compareceu ✓`;
      }
      if (parsed.action === 'mark_missed') {
        successSummary = `${parsed.data?.lead_name || 'Lead'} marcado como não compareceu ✓`;
      }
      if (parsed.action === 'mark_enrolled') {
        successSummary = `${parsed.data?.lead_name || 'Lead'} matriculado ✓`;
      }
      if (parsed.action === 'mark_lost') {
        successSummary = `${parsed.data?.lead_name || 'Lead'} marcado como perdido ✓`;
      }
      if (parsed.action === 'schedule_experimental') {
        successSummary = `Experimental agendada para ${parsed.data?.lead_name || 'lead'} ✓`;
      }
      if (parsed.action === 'move_pipeline_stage') {
        successSummary = `${parsed.data?.lead_name || 'Lead'} movido de etapa ✓`;
      }
      if (parsed.action === 'create_lead') {
        successSummary = `Lead ${parsed.data?.name || parsed.data?.lead_name || ''} cadastrado ✓`;
      }
      if (parsed.action === 'register_whatsapp') {
        successSummary = result?.whatsapp_sent
          ? `WhatsApp enviado para ${parsed.data?.lead_name || 'lead'} ✓`
          : `WhatsApp registrado no histórico de ${parsed.data?.lead_name || 'lead'} ✓`;
      }
      if (parsed.action === 'add_note') {
        successSummary = 'Nota adicionada ✓';
      }
      if (parsed.action === 'settle_transaction') {
        successSummary = 'Transação liquidada ✓';
      }
      setParsed((prev) => (prev ? { ...prev, summary: successSummary } : prev));
      setState('success');
      setTimeout(() => onOpenChange(false), 2500);
    } catch (err) {
      setErrorMsg(err?.message || 'Erro ao executar a ação.');
      setState('error');
    }
  }, [parsed, execute, onOpenChange]);

  const handleCorrect = useCallback(() => {
    if (!parsed?.action) return;
    if (parsed.action === 'register_sale') {
      const detail = buildSalePrefillFromParsed(parsed);
      if (onCorrect) onCorrect(parsed, detail);
      else dispatchNlSalePrefill(detail);
    } else if (parsed.action === 'register_payment') {
      const detail = buildPaymentPrefillFromParsed(parsed);
      if (onCorrect) onCorrect(parsed, detail);
      else dispatchNlPaymentPrefill(detail);
    }
    onOpenChange(false);
  }, [parsed, onCorrect, onOpenChange]);

  const inputDisabled = state === 'loading' || state === 'executing' || state === 'success';
  const missingBlock = Array.isArray(parsed?.missing) && parsed.missing.length > 0;
  const canConfirm =
    parsed &&
    parsed.action != null &&
    parsed.confidence !== 'low' &&
    !missingBlock &&
    (
      parsed.action === 'register_payment' ||
      parsed.action === 'register_sale' ||
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
      parsed.action === 'update_payment' ||
      parsed.action === 'adjust_stock' ||
      parsed.action === 'inventory_query' ||
      parsed.action === 'academy_query'
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
          zIndex: 9999,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'all' : 'none',
          transition: 'opacity 0.2s'
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assistente · perguntas e ações"
          onClick={(e) => e.stopPropagation()}
          style={{
            background: 'var(--surface)',
            borderRadius: 16,
            width: 'min(560px, calc(100vw - 32px))',
            maxHeight: 'min(85vh, 720px)',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 64px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.06)',
            transform: open ? 'translateY(0) scale(1)' : 'translateY(-8px) scale(0.98)',
            transition: 'transform 0.2s',
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              flexShrink: 0,
              borderBottom: '0.5px solid var(--border-light)',
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span style={{ color: 'var(--petroleo)', fontSize: 18 }} aria-hidden>
              ✦
            </span>
            <input
              ref={inputRef}
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && text.trim() && state === 'idle') {
                  e.preventDefault();
                  void handleInterpret();
                }
              }}
              disabled={inputDisabled}
              placeholder="Ex.: Quem não pagou? · Registrar pagamento do João em março"
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

          <div
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >

          {state === 'idle' ? (
            <div style={{ padding: 20 }}>
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {[...ASK_SUGGESTIONS.slice(0, 4), ...ACTION_SUGGESTIONS].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="filter-chip"
                      onClick={() => {
                        setText(s);
                        inputRef.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAskHelp((v) => !v)}
                  style={{
                    marginBottom: showAskHelp ? 12 : 14,
                    padding: 0,
                    border: 'none',
                    background: 'none',
                    color: 'var(--petroleo)',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {showAskHelp ? 'Ocultar exemplos' : 'O que posso perguntar ou fazer?'}
                </button>
                {showAskHelp ? (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: '1px solid var(--border-light)',
                      background: 'var(--surface-hover, #fafafa)',
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {ASK_HELP_SECTIONS.map((section) => (
                      <div key={section.title} style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>
                          {section.title}
                        </div>
                        <ul style={{ margin: 0, paddingLeft: 18 }}>
                          {section.examples.map((ex) => (
                            <li key={ex}>{ex}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      Comandos (registrar pagamento, matricular lead, etc.) exigem confirmação. Consulta
                      detalhada: docs/assistive-queries.md
                    </div>
                  </div>
                ) : null}
              </>
              <button
                type="button"
                disabled={!text.trim()}
                onClick={() => void handleInterpret()}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--petroleo)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: text.trim() ? 'pointer' : 'not-allowed',
                  opacity: text.trim() ? 1 : 0.5,
                  fontFamily: 'inherit'
                }}
              >
                Enviar
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
                  border: '2px solid var(--v200)',
                  borderTopColor: 'var(--petroleo)',
                  borderRadius: '50%',
                  animation: 'nl-cmd-spin 0.7s linear infinite'
                }}
              />
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Processando…
              </div>
            </div>
          ) : null}

          {state === 'result' && parsed ? (
            <div style={{ padding: '20px 20px 0' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--petroleo)', letterSpacing: '0.08em', marginBottom: 8 }}>
                ✦ RESPOSTA
              </div>
              {(() => {
                const rows = Array.isArray(parsed.data?.rows) ? parsed.data.rows : [];
                const hasRows = rows.length > 0;
                const summary = buildNlQuerySummary(parsed.data || {});
                if (hasRows) {
                  return (
                    <>
                      <p
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          lineHeight: 1.5,
                          color: 'var(--text)',
                          margin: '0 0 12px',
                        }}
                      >
                        {summary}
                      </p>
                      <div
                        style={{
                          maxHeight: 'min(48vh, 360px)',
                          overflowY: 'auto',
                          WebkitOverflowScrolling: 'touch',
                          border: '1px solid var(--border-light)',
                          borderRadius: 10,
                        }}
                      >
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--surface-hover, #fafafa)' }}>
                              <th
                                style={{
                                  textAlign: 'left',
                                  padding: '8px 10px',
                                  position: 'sticky',
                                  top: 0,
                                  background: 'var(--surface-hover, #fafafa)',
                                  zIndex: 1,
                                }}
                              >
                                Nome
                              </th>
                              <th
                                style={{
                                  textAlign: 'left',
                                  padding: '8px 10px',
                                  position: 'sticky',
                                  top: 0,
                                  background: 'var(--surface-hover, #fafafa)',
                                  zIndex: 1,
                                }}
                              >
                                Detalhe
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((row) => (
                              <tr key={row.id} style={{ borderTop: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '8px 10px' }}>
                                  {row.id ? (
                                    <Link
                                      to={row.linkKind === 'lead' ? `/lead/${row.id}` : `/student/${row.id}`}
                                      style={{ color: 'var(--petroleo)', fontWeight: 600 }}
                                    >
                                      {row.name || '—'}
                                    </Link>
                                  ) : (
                                    row.name || '—'
                                  )}
                                </td>
                                <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>
                                  {row.line ||
                                    (row.pending != null
                                      ? formatBrl(row.pending)
                                      : row.plan ||
                                        row.origin ||
                                        row.lostReason ||
                                        row.pipelineStage ||
                                        row.scheduledDate ||
                                        row.phone ||
                                        row.attendedAt ||
                                        row.missedAt ||
                                        '—')}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  );
                }
                return (
                  <div
                    style={{
                      maxHeight: 'min(52vh, 400px)',
                      overflowY: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      fontSize: 14,
                      color: 'var(--text)',
                    }}
                  >
                    <NlResponseMarkdown
                      text={nlQueryMarkdownBody(parsed.data || {}) || parsed.summary || parsed.data?.resposta || '—'}
                    />
                  </div>
                );
              })()}
            </div>
          ) : null}

          {state === 'executing' ? (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <div
                style={{
                  width: 20,
                  height: 20,
                  margin: '0 auto 14px',
                  border: '2px solid var(--v200)',
                  borderTopColor: 'var(--petroleo)',
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
              {Array.isArray(parsed.warnings) && parsed.warnings.length > 0 ? (
                <div style={{ marginBottom: 12 }}>
                  {parsed.warnings.map((w) => (
                    <div
                      key={String(w).slice(0, 64)}
                      style={{
                        marginBottom: 6,
                        padding: '8px 10px',
                        borderRadius: 8,
                        background: '#fff8e6',
                        color: '#8a6b1a',
                        fontSize: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      ⚠ {w}
                    </div>
                  ))}
                </div>
              ) : null}
              <div style={{ background: 'var(--accent-light)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--petroleo)', letterSpacing: '0.08em', marginBottom: 8 }}>
                  ✦ CONFIRMAR
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>{parsed.summary}</div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {parsed.action === 'register_payment' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno:</strong>{' '}
                        {parsed.data?.student_name || '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Referência:</strong>{' '}
                        {formatRefMonth(parsed.data?.reference_month)}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Valor:</strong>{' '}
                        {parsed.data?.amount != null && parsed.data?.amount !== ''
                          ? formatBrl(parsed.data.amount)
                          : parsed.data?.expected_amount
                            ? formatBrl(parsed.data.expected_amount)
                            : '—'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Pagamento:</strong>{' '}
                        {parsed.data?.method ? formatNlPaymentMethod(parsed.data.method) : 'PIX (padrão)'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Status:</strong> Pago
                      </li>
                    </>
                  ) : parsed.action === 'register_sale' ? (
                    <>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Produto:</strong>{' '}
                        {parsed.data?.product_name || '—'}
                        {parsed.data?.variation ? ` · ${parsed.data.variation}` : ''}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Aluno:</strong>{' '}
                        {parsed.data?.student_name ||
                          parsed.data?.customer_name ||
                          (parsed.data?.student_id ? '—' : 'Cliente avulso')}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Quantidade:</strong>{' '}
                        {parsed.data?.quantity != null ? String(parsed.data.quantity) : '1'}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Valor:</strong>{' '}
                        {formatBrl(
                          Number(parsed.data?.unit_price || 0) * Number(parsed.data?.quantity || 1)
                        )}
                      </li>
                      <li>
                        <strong style={{ color: 'var(--text)' }}>Pagamento:</strong>{' '}
                        {paymentFormLabel(parsed.data?.payment_form || parsed.data?.method || 'pix')}
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
                        <strong style={{ color: 'var(--text)' }}>Resultado:</strong> {terms.nlCommandBarMarkEnrolledResult}
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
                      <li style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                        Envia template de contato se WhatsApp estiver configurado; caso contrário, só registra no histórico.
                      </li>
                    </>
                  ) : (
                    <li style={{ color: 'var(--text-muted)' }}>Revise o resumo acima antes de confirmar.</li>
                  )}
                </ul>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  style={{
                    flex: '1 1 90px',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    color: 'var(--text)',
                  }}
                >
                  Cancelar
                </button>
                {parsed.action === 'register_sale' || parsed.action === 'register_payment' ? (
                  <button
                    type="button"
                    onClick={handleCorrect}
                    style={{
                      flex: '1 1 90px',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid var(--petroleo)',
                      background: 'var(--surface)',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      color: 'var(--petroleo)',
                    }}
                  >
                    Corrigir
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!canConfirm}
                  onClick={() => void handleExecute()}
                  style={{
                    flex: '1 1 120px',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: 'none',
                    background: 'var(--petroleo)',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: canConfirm ? 'pointer' : 'not-allowed',
                    opacity: canConfirm ? 1 : 0.5,
                    fontFamily: 'inherit',
                  }}
                >
                  Confirmar
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

          </div>

          {state === 'result' && parsed ? (
            <div
              style={{
                flexShrink: 0,
                display: 'flex',
                gap: 10,
                padding: '16px 20px',
                borderTop: '0.5px solid var(--border-light)',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setState('idle');
                  setParsed(null);
                  setText('');
                }}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Nova pergunta
              </button>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: 'none',
                  background: 'var(--petroleo)',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Fechar
              </button>
            </div>
          ) : null}

          <div
            style={{
              flexShrink: 0,
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
              {`Assistente · perguntas e ações · ${
                context === 'funil'
                  ? 'Funil'
                  : context === 'perfil'
                    ? 'Geral'
                    : context === 'vendas'
                      ? 'Vendas'
                      : context === 'financeiro'
                        ? 'Financeiro'
                        : 'Geral'
              }`}
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
