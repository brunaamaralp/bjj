import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Sparkles, WifiOff } from 'lucide-react';
import { useInboxConversation } from '../../hooks/useInboxConversation';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import ThreadSkeleton from './ThreadSkeleton';
import ProfileComposer from './ProfileComposer';

function formatDayLabel(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  const now = new Date();
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const nn = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((dd.getTime() - nn.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Hoje';
  if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' });
}

function formatTimeOnly(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function messageKey(m, idx) {
  const mid = String(m?.message_id || '').trim();
  if (mid) return mid;
  const role = String(m?.role || '').trim();
  const ts = String(m?.timestamp || '').trim();
  const content = String(m?.content || '').trim();
  return `${role}:${ts}:${content.slice(0, 80)}:${idx}`;
}

function isOutgoingMessage(m) {
  return m?.role === 'assistant';
}

function buildBlocks(messages) {
  const msgs = Array.isArray(messages) ? messages : [];
  const out = [];
  let lastDayKey = '';
  for (let i = 0; i < msgs.length; i += 1) {
    const m = msgs[i];
    const ts = String(m?.timestamp || '').trim();
    const d = ts ? new Date(ts) : null;
    const dayKey =
      d && Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : '';
    if (dayKey && dayKey !== lastDayKey) {
      out.push({
        type: 'day',
        key: dayKey,
        label: formatDayLabel(ts) || d.toLocaleDateString('pt-BR'),
      });
      lastDayKey = dayKey;
    }
    out.push({
      type: 'message',
      key: messageKey(m, i),
      m,
      outgoing: isOutgoingMessage(m),
      pending: Boolean(m?._optimistic),
    });
  }
  return out;
}

function ProfileConversationEmpty({ icon: Icon, title, description, action }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
        gap: 12,
        minHeight: 200,
      }}
    >
      {Icon ? <Icon size={40} strokeWidth={1.5} style={{ color: 'var(--text-muted)' }} aria-hidden /> : null}
      <div style={{ fontWeight: 800, fontSize: 15, color: 'var(--text)' }}>{title}</div>
      {description ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.45, maxWidth: 320 }}>
          {description}
        </p>
      ) : null}
      {action || null}
    </div>
  );
}

function HandoffBanner({ onDismiss }) {
  return (
    <div
      role="status"
      style={{
        flexShrink: 0,
        margin: '0 12px 8px',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--accent-light)',
        color: 'var(--cosmos)',
        fontSize: 12,
        lineHeight: 1.4,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      <Sparkles size={16} style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
      <span style={{ flex: 1 }}>
        Agente IA respondendo — ao enviar, você assume o atendimento
      </span>
      <button
        type="button"
        className="btn btn-outline"
        style={{ minHeight: 28, padding: '2px 10px', fontSize: 11, flexShrink: 0 }}
        onClick={onDismiss}
      >
        Ok
      </button>
    </div>
  );
}

export default function ProfileConversationTab({ phone: rawPhone, academyId, leadName }) {
  const displayName = String(leadName || '').trim() || 'o contato';
  const phoneDigits = String(rawPhone || '').replace(/\D/g, '');

  const {
    messages,
    summary,
    loading,
    loadingMore,
    sending,
    error,
    sendError,
    hasMore,
    loadMore,
    sendMessage,
    markRead,
    refresh,
  } = useInboxConversation({ phone: rawPhone, academyId, enabled: Boolean(phoneDigits && academyId) });

  const { waStatus } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = String(waStatus || '').trim() === 'connected';

  const [draft, setDraft] = useState('');
  const [handoffBannerDismissed, setHandoffBannerDismissed] = useState(false);

  const scrollRef = useRef(null);
  const initialScrollDoneRef = useRef(false);
  const markedReadRef = useRef(false);

  useEffect(() => {
    initialScrollDoneRef.current = false;
    markedReadRef.current = false;
    setHandoffBannerDismissed(false);
  }, [phoneDigits]);

  useEffect(() => {
    if (loading || markedReadRef.current) return;
    if ((summary?.unread_count ?? 0) > 0) {
      markedReadRef.current = true;
      void markRead();
    }
  }, [loading, summary?.unread_count, markRead]);

  useEffect(() => {
    if (loading || initialScrollDoneRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      initialScrollDoneRef.current = true;
    });
  }, [loading, messages]);

  useEffect(() => {
    if (loading) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [messages.length, sending, loading]);

  const blocks = useMemo(() => buildBlocks(messages), [messages]);
  const hasMessages = messages.length > 0;
  const showAiHandoffBanner = Boolean(summary?.handoff) && !handoffBannerDismissed;
  const inboxHref = phoneDigits ? `/inbox?phone=${encodeURIComponent(phoneDigits)}` : '/inbox';

  const handleSend = async () => {
    const text = String(draft || '').trim();
    if (!text) return;
    const ok = await sendMessage(text);
    if (ok) setDraft('');
  };

  if (!phoneDigits) {
    return (
      <ProfileConversationEmpty
        icon={MessageCircle}
        title="Nenhum telefone cadastrado"
        description="Adicione o telefone do aluno para ver o histórico de mensagens."
      />
    );
  }

  if (!waConnected && !loading && !hasMessages) {
    return (
      <ProfileConversationEmpty
        icon={WifiOff}
        title="WhatsApp não conectado"
        description="Configure o WhatsApp em Configurações → Agente IA para ver as conversas."
        action={
          <Link to="/agente-ia" className="btn btn-primary" style={{ marginTop: 8 }}>
            Configurar
          </Link>
        }
      />
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 280,
        background: 'var(--surface)',
      }}
    >
      {!waConnected ? (
        <div
          role="status"
          style={{
            flexShrink: 0,
            padding: '10px 14px',
            background: 'var(--warning-light)',
            color: 'var(--warning-text, #b45309)',
            fontSize: 12,
            fontWeight: 600,
            borderBottom: '1px solid var(--border-light)',
          }}
        >
          WhatsApp desconectado — não é possível enviar mensagens
        </div>
      ) : null}

      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 16,
          background: 'rgba(0, 68, 102,0.04)',
        }}
      >
        {loading ? <ThreadSkeleton /> : null}

        {!loading && error ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
            <button type="button" className="btn btn-outline" onClick={() => void refresh()}>
              Tentar novamente
            </button>
          </div>
        ) : null}

        {!loading && !error && !hasMessages ? (
          <ProfileConversationEmpty
            icon={MessageCircle}
            title="Nenhuma conversa ainda"
            description={`Quando ${displayName} enviar uma mensagem, ela aparecerá aqui.`}
            action={
              waConnected ? null : (
                <Link to={inboxHref} className="btn btn-outline" style={{ marginTop: 8 }}>
                  Abrir no Inbox
                </Link>
              )
            }
          />
        ) : null}

        {!loading && !error && hasMessages && hasMore ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 12px', minHeight: 34, fontSize: 12 }}
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Carregando…' : 'Carregar mensagens anteriores'}
            </button>
          </div>
        ) : null}

        {!loading && !error && hasMessages
          ? blocks.map((b) => {
              if (b.type === 'day') {
                return (
                  <div
                    key={b.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      margin: '16px 0',
                      color: 'var(--mid, var(--text-muted))',
                      fontSize: 11,
                    }}
                  >
                    <span style={{ flex: 1, height: 1, background: 'var(--border-mid, var(--border))' }} />
                    <span style={{ flexShrink: 0 }}>{b.label}</span>
                    <span style={{ flex: 1, height: 1, background: 'var(--border-mid, var(--border))' }} />
                  </div>
                );
              }
              const content = String(b.m?.content || '').trim();
              if (!content) return null;
              return (
                <div
                  key={b.key}
                  style={{
                    display: 'flex',
                    justifyContent: b.outgoing ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                    opacity: b.pending ? 0.75 : 1,
                  }}
                >
                  <div
                    style={{
                      maxWidth: '78%',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: b.outgoing ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 14,
                        lineHeight: 1.4,
                        background: b.outgoing ? 'var(--v100, var(--accent-light))' : 'var(--surface)',
                        color: 'var(--ink, var(--text))',
                        border: b.outgoing ? 'none' : '1px solid var(--border-mid, var(--border))',
                        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
                      }}
                    >
                      {content}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--faint, var(--text-muted))', marginTop: 4 }}>
                      {formatTimeOnly(b.m?.timestamp)}
                      {b.pending ? ' · Enviando…' : ''}
                    </span>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      {sendError ? (
        <div
          role="alert"
          style={{
            flexShrink: 0,
            padding: '8px 14px',
            fontSize: 12,
            color: 'var(--danger)',
            background: 'var(--danger-light, #fef2f2)',
            borderTop: '1px solid var(--border-light)',
          }}
        >
          {sendError}
        </div>
      ) : null}

      {showAiHandoffBanner ? (
        <HandoffBanner onDismiss={() => setHandoffBannerDismissed(true)} />
      ) : null}

      <ProfileComposer
        value={draft}
        onChange={setDraft}
        onSend={handleSend}
        sending={sending}
        disabled={!waConnected}
      />
    </div>
  );
}
