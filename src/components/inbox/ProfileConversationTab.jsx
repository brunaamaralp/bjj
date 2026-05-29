import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, MessageCircle, WifiOff } from 'lucide-react';
import { account } from '../../lib/appwrite';
import { fetchWithBillingGuard } from '../../lib/billingBlockedFetch';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import ThreadSkeleton from './ThreadSkeleton';

const POLL_MS = 30_000;
const PAGE_LIMIT = 30;

function normalizePhone(v) {
  return String(v || '').replace(/\D/g, '');
}

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
    });
  }
  return out;
}

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
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

export default function ProfileConversationTab({ phone: rawPhone, academyId, leadName }) {
  const phone = useMemo(() => normalizePhone(rawPhone), [rawPhone]);
  const displayName = String(leadName || '').trim() || 'o contato';

  const { waStatus } = useZapsterWhatsAppConnection(academyId, {
    statusPollWhileMounted: true,
    watchAcademyStatus: true,
  });
  const waConnected = String(waStatus || '').trim() === 'connected';

  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [nextCursor, setNextCursor] = useState('');
  const [hasConversation, setHasConversation] = useState(false);

  const scrollRef = useRef(null);
  const abortRef = useRef(null);
  const requestSeqRef = useRef(0);
  const initialScrollDoneRef = useRef(false);

  const loadThread = useCallback(
    async ({ silent = false, cursor = '', append = false } = {}) => {
      if (!phone || !academyId) return;
      const reqSeq = ++requestSeqRef.current;

      if (!append) {
        try {
          if (abortRef.current) abortRef.current.abort();
        } catch {
          void 0;
        }
        abortRef.current = new AbortController();
      }

      const signal = !append && abortRef.current ? abortRef.current.signal : undefined;

      if (!silent) {
        if (append) setPaging(true);
        else setLoading(true);
      }
      if (!append) setError('');

      try {
        const jwt = await getJwt();
        const params = new URLSearchParams();
        params.set('limit', String(PAGE_LIMIT));
        if (cursor) params.set('cursor', String(cursor));
        const qs = params.toString();
        const { blocked, res: resp } = await fetchWithBillingGuard(
          `/api/conversations/${encodeURIComponent(phone)}${qs ? `?${qs}` : ''}`,
          {
            headers: {
              Authorization: `Bearer ${jwt}`,
              'x-academy-id': String(academyId || ''),
            },
            ...(signal ? { signal } : {}),
          }
        );
        if (blocked || reqSeq !== requestSeqRef.current) return;
        if (!resp) return;

        const raw = await resp.text();
        let data = {};
        try {
          data = raw ? JSON.parse(raw) : {};
        } catch {
          if (!silent) setError('Erro ao carregar conversa.');
          return;
        }

        if (!resp.ok) {
          if (!silent) setError(data?.erro || data?.error || 'Erro ao carregar conversa.');
          return;
        }

        const incoming = Array.isArray(data?.messages) ? data.messages : [];
        const nextCur = typeof data?.next_cursor === 'string' ? data.next_cursor : '';
        const convId = typeof data?.conversation_id === 'string' ? data.conversation_id.trim() : '';

        setHasConversation(Boolean(convId) || incoming.length > 0);
        setNextCursor(nextCur);

        setMessages((prev) => {
          if (!append) return incoming;
          const combined = [...incoming, ...(Array.isArray(prev) ? prev : [])];
          const seen = new Set();
          const deduped = [];
          for (const m of combined) {
            const mid = String(m?.message_id || '').trim();
            const key = mid || `${String(m?.role || '')}:${String(m?.timestamp || '')}:${String(m?.content || '')}`;
            if (!key || seen.has(key)) continue;
            seen.add(key);
            deduped.push(m);
          }
          return deduped;
        });
      } catch (e) {
        if (e?.name === 'AbortError') return;
        if (!silent) setError(e?.message || 'Erro ao carregar conversa.');
      } finally {
        if (reqSeq === requestSeqRef.current) {
          setLoading(false);
          setPaging(false);
        }
      }
    },
    [phone, academyId]
  );

  useEffect(() => {
    initialScrollDoneRef.current = false;
    if (!phone || !academyId) {
      setLoading(false);
      setMessages([]);
      setNextCursor('');
      setHasConversation(false);
      return undefined;
    }
    void loadThread({ silent: false });
    return () => {
      requestSeqRef.current += 1;
      try {
        if (abortRef.current) abortRef.current.abort();
      } catch {
        void 0;
      }
    };
  }, [phone, academyId, loadThread]);

  useEffect(() => {
    if (!phone || !academyId || loading) return undefined;

    let timer = null;
    const tick = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadThread({ silent: true });
    };

    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, POLL_MS);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') tick();
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [phone, academyId, loading, loadThread]);

  useEffect(() => {
    if (loading || initialScrollDoneRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      initialScrollDoneRef.current = true;
    });
  }, [loading, messages]);

  const blocks = useMemo(() => buildBlocks(messages), [messages]);
  const hasMessages = messages.length > 0;
  const inboxHref = phone ? `/inbox?phone=${encodeURIComponent(phone)}` : '/inbox';

  if (!phone) {
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
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: 16,
          background: 'rgba(91,63,191,0.04)',
        }}
      >
        {loading ? <ThreadSkeleton /> : null}

        {!loading && error ? (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</p>
            <button type="button" className="btn btn-outline" onClick={() => void loadThread({ silent: false })}>
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
              <Link to={inboxHref} className="btn btn-outline" style={{ marginTop: 8 }}>
                Responder no Inbox
              </Link>
            }
          />
        ) : null}

        {!loading && !error && hasMessages && nextCursor ? (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: '6px 12px', minHeight: 34, fontSize: 12 }}
              disabled={paging}
              onClick={() => void loadThread({ silent: true, cursor: nextCursor, append: true })}
            >
              {paging ? 'Carregando…' : 'Carregar mensagens anteriores'}
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
                  }}
                >
                  <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', alignItems: b.outgoing ? 'flex-end' : 'flex-start' }}>
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: 14,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: 14,
                        lineHeight: 1.4,
                        background: b.outgoing ? 'var(--v100, var(--accent-light, #EEEDFE))' : 'var(--surface)',
                        color: 'var(--ink, var(--text))',
                        border: b.outgoing ? 'none' : '1px solid var(--border-mid, var(--border))',
                        boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.04))',
                      }}
                    >
                      {content}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--faint, var(--text-muted))', marginTop: 4 }}>
                      {formatTimeOnly(b.m?.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          : null}
      </div>

      {hasMessages ? (
        <div
          style={{
            flexShrink: 0,
            padding: 12,
            borderTop: '1px solid var(--border-light, var(--border))',
            background: 'var(--surface)',
          }}
        >
          <Link
            to={inboxHref}
            className="btn btn-outline"
            style={{
              width: '100%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 40,
            }}
          >
            Responder no Inbox
            <ExternalLink size={14} aria-hidden />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
