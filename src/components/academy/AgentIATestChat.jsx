import React, { useState } from 'react';
import { createSessionJwt } from '../../lib/appwrite';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';
import { mapAgentTestErrorMessage } from '../../lib/agentTestErrorMessage.js';
import { getTodayIso } from './agentIaUtils.js';

export default function AgentIATestChat({
  academyId,
  aiName,
  academyName,
  workspaceNoun,
  contactLabel,
  testMessagesToday,
  testMessagesResetDate,
  onTestsUsageUpdate,
  onToggleIa,
  togglingIa,
  onClose,
  onActivated,
  addToast,
}) {
  const todayIso = getTodayIso();
  const usedToday = testMessagesResetDate === todayIso ? (Number(testMessagesToday) || 0) : 0;
  const testsLimit = 10;
  const initialTestsLeft = Math.max(0, testsLimit - usedToday);

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Olá! Sou ${aiName || 'assistente'}, assistente configurado para ${academyName || `sua ${workspaceNoun}`}. Como posso ajudar? (Modo de teste)`,
    },
  ]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [testsLeft, setTestsLeftLocal] = useState(initialTestsLeft);

  const handleActivate = async () => {
    const ok = await onToggleIa(true);
    if (!ok) return;
    onActivated();
  };

  const handleSend = async () => {
    if (!input.trim() || sending || testsLeft <= 0) return;
    const userMsg = { role: 'user', content: input.trim() };
    const historyForRequest = messages;

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), 30000);
    try {
      const jwt = await createSessionJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/agent/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyId || '').trim(),
        },
        body: JSON.stringify({
          academyId,
          message: userMsg.content,
          history: historyForRequest,
        }),
        signal: abort.signal,
      });

      clearTimeout(timeoutId);
      if (blocked || !resp) return;

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const fallbackChat = mapAgentTestErrorMessage({
          status: resp.status,
          code: data?.code || data?.erro,
          erro: data?.erro,
          message: data?.message,
        });
        if (resp.status === 429) {
          addToast({ type: 'warning', message: data?.message || 'Limite diário atingido' });
          setTestsLeftLocal(0);
          setMessages((prev) => [...prev, { role: 'assistant', content: fallbackChat }]);
          return;
        }
        addToast({ type: 'error', message: fallbackChat });
        setMessages((prev) => [...prev, { role: 'assistant', content: fallbackChat }]);
        return;
      }

      const reply = data?.response != null ? String(data.response).trim() : '';
      if (!reply) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'O assistente não gerou resposta. Revise as instruções em Agente de Atendimento.',
          },
        ]);
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      }
      const nextUsed = Number(data?.testsUsedToday) || usedToday + 1;
      const nextLeft = Math.max(0, testsLimit - nextUsed);
      setTestsLeftLocal(nextLeft);
      onTestsUsageUpdate(nextUsed, todayIso);
    } catch (e) {
      clearTimeout(timeoutId);
      const aborted = e?.name === 'AbortError';
      const msg = aborted ? 'Tempo esgotado — tente novamente.' : mapAgentTestErrorMessage({ erro: e?.message });
      addToast({ type: 'error', message: msg });
      setMessages((prev) => [...prev, { role: 'assistant', content: msg }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="agent-chat-container agent-chat-sandbox">
      <div className="agent-chat-sandbox__banner" role="status">
        Modo teste — mensagens não são enviadas ao aluno
      </div>
      <div className="agent-chat-header" style={{ paddingBottom: 14, padding: '12px 14px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div>
            <div className="agent-chat-title" style={{ fontSize: 14 }}>
              Chat de teste
            </div>
            <div className="agent-chat-subtitle" style={{ marginTop: 6 }}>
              {testsLeft} de 10 testes restantes hoje · perguntas de exemplo, sem dados reais da academia
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '6px 12px', flexShrink: 0 }}
            onClick={onClose}
            disabled={sending}
          >
            Fechar
          </button>
        </div>
      </div>

      <div className="agent-chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`agent-chat-bubble ${msg.role === 'assistant' ? 'nave' : 'user'}`}>
            <div className="agent-chat-content">
              <div className="agent-chat-text">{msg.content}</div>
            </div>
          </div>
        ))}

        {sending ? (
          <div className="agent-chat-bubble nave">
            <div className="agent-chat-typing" aria-label="Digitando…">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : null}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: 14 }}>
        {testsLeft > 0 ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={`Simule uma mensagem de um ${contactLabel.toLowerCase()}…`}
              rows={2}
              disabled={sending}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleSend()}
              disabled={!input.trim() || sending}
              style={{ minWidth: 108 }}
            >
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>Limite de 10 testes atingido hoje.</p>
            <p className="text-small" style={{ margin: 0, color: 'var(--text-secondary)' }}>
              Volte amanhã para continuar testando, ou ative o assistente se estiver satisfeito.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => void handleActivate()} disabled={togglingIa}>
              Ativar assistente
            </button>
          </div>
        )}

        {testsLeft > 0 && messages.length > 2 ? (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              Gostou das respostas?
            </span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleActivate()} disabled={togglingIa}>
              Ativar assistente
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
