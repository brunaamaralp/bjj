import React, { useEffect, useMemo, useRef, useState } from 'react';
import { account } from '../lib/appwrite';
import { useUiStore } from '../store/useUiStore';

function normalizePhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

function formatWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR');
}

export default function Inbox() {
  const addToast = useUiStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  const draftRef = useRef('');
  const selectedPhoneRef = useRef('');
  const textareaRef = useRef(null);

  const normalizedSearch = useMemo(() => normalizePhone(search), [search]);

  useEffect(() => {
    draftRef.current = String(draft || '');
  }, [draft]);

  useEffect(() => {
    selectedPhoneRef.current = String(selectedPhone || '');
  }, [selectedPhone]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const apply = () => setIsMobile(Boolean(mq.matches));
    apply();
    if (mq.addEventListener) mq.addEventListener('change', apply);
    else mq.addListener(apply);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', apply);
      else mq.removeListener(apply);
    };
  }, []);

  function safeParseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function normalizeApiError(raw, fallback) {
    const s = String(raw || '').trim();
    if (!s) return fallback;
    const parsed = safeParseJson(s);
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.erro === 'string' && parsed.erro.trim()) return parsed.erro.trim();
      if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
    }
    return s;
  }

  async function loadList({ reset = false, silent = false } = {}) {
    if (reset) {
      setNextCursor(null);
      setHasMore(true);
    }
    if (!reset && (!hasMore || loadingMore || loading)) return;
    if (!silent) setError('');
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const jwt = await getJwt();
      const qs = new URLSearchParams();
      qs.set('limit', '50');
      const cursorToUse = reset ? '' : String(nextCursor || '').trim();
      if (cursorToUse) qs.set('cursor', cursorToUse);
      if (normalizedSearch) qs.set('search', normalizedSearch);
      const resp = await fetch(`/api/conversations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao carregar conversas'));
      const data = safeParseJson(raw) || {};
      const next = Array.isArray(data?.items) ? data.items : [];
      const nextCur = data?.next_cursor ? String(data.next_cursor) : null;
      setNextCursor(nextCur);
      setHasMore(Boolean(nextCur) && next.length > 0 && !normalizedSearch);
      setLastUpdatedAt(new Date().toISOString());
      setItems((prev) => {
        const incoming = reset ? next : [...(Array.isArray(prev) ? prev : []), ...next];
        const seen = new Set();
        const deduped = [];
        for (const it of incoming) {
          const k = String(it?.id || it?.phone_number || '');
          if (!k || seen.has(k)) continue;
          seen.add(k);
          deduped.push(it);
        }
        return deduped;
      });
      if (reset) {
        if (!selectedPhoneRef.current && next.length > 0) setSelectedPhone(String(next[0].phone_number || ''));
      }
    } catch (e) {
      if (!silent) setError(e?.message || 'Erro');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  }

  async function loadThread(phone, { silent = false } = {}) {
    const p = String(phone || '').trim();
    if (!p) return;
    if (!silent) setError('');
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(p)}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao carregar conversa'));
      const data = safeParseJson(raw) || {};
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
      setSelected({ phone: p, messages, summary });
    } catch (e) {
      if (!silent) setError(e?.message || 'Erro');
    }
  }

  async function sendManual() {
    const phone = String(selectedPhone || '').trim();
    const text = String(draft || '').trim();
    if (!phone || !text) return;
    setError('');
    setSending(true);
    try {
      const jwt = await getJwt();
      const resp = await fetch('/api/whatsapp/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'content-type': 'application/json' },
        body: JSON.stringify({ phone, text })
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(normalizeApiError(raw, 'Falha ao enviar'));
      const nowIso = new Date().toISOString();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        msgs.push({ role: 'assistant', content: text, timestamp: nowIso });
        return { ...prev, messages: msgs.slice(-50) };
      });
      setDraft('');
      addToast({ type: 'success', message: 'Enviado' });
      await loadList({ reset: true, silent: true });
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setSending(false);
    }
  }

  const applyWrapToDraft = (prefix, suffix = prefix) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const selectedText = cur.slice(start, end);
    const wrappingEmpty = start === end;
    const insert = wrappingEmpty ? `${prefix}${suffix}` : `${prefix}${selectedText}${suffix}`;
    const next = cur.slice(0, start) + insert + cur.slice(end);
    setDraft(next);
    setEmojiOpen(false);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        if (wrappingEmpty) {
          const pos = start + prefix.length;
          textarea.setSelectionRange(pos, pos);
        } else {
          const selStart = start + prefix.length;
          const selEnd = selStart + selectedText.length;
          textarea.setSelectionRange(selStart, selEnd);
        }
      }, 0);
    } catch {
      void 0;
    }
  };

  const insertAtCursor = (text) => {
    const cur = String(draftRef.current || '');
    const el = textareaRef.current;
    const start = el && Number.isFinite(el.selectionStart) ? el.selectionStart : cur.length;
    const end = el && Number.isFinite(el.selectionEnd) ? el.selectionEnd : cur.length;
    const next = cur.slice(0, start) + text + cur.slice(end);
    setDraft(next);
    try {
      setTimeout(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;
        textarea.focus();
        const pos = start + text.length;
        textarea.setSelectionRange(pos, pos);
      }, 0);
    } catch {
      void 0;
    }
  };

  const emojis = useMemo(
    () => ['😀', '😂', '😍', '🥰', '🙏', '👍', '👏', '🎉', '🔥', '✅', '❌', '🤝', '😢', '🤔', '⭐', '💪', '🥋', '📍', '📞', '⏰'],
    []
  );

  useEffect(() => {
    loadList({ reset: true });
  }, [normalizedSearch]);

  useEffect(() => {
    if (selectedPhone) loadThread(selectedPhone);
  }, [selectedPhone]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      loadList({ reset: true, silent: true });
      const phone = selectedPhoneRef.current;
      if (phone && !String(draftRef.current || '').trim()) {
        loadThread(phone, { silent: true });
      }
    }, 15000);
    return () => clearInterval(id);
  }, [autoRefresh, normalizedSearch]);

  const listPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div>Conversas</div>
        {!normalizedSearch && (
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            {hasMore ? 'Role para carregar mais' : 'Fim'}
          </div>
        )}
      </div>
      <div
        style={{ maxHeight: isMobile ? '72vh' : '70vh', overflow: 'auto' }}
        onScroll={(e) => {
          if (normalizedSearch) return;
          const el = e.currentTarget;
          const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
          if (remaining < 240) loadList({ reset: false, silent: true });
        }}
      >
        {items.map((it) => {
          const phone = String(it?.phone_number || '');
          const active = phone === selectedPhone;
          return (
            <button
              key={String(it?.id || phone)}
              onClick={() => setSelectedPhone(phone)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: 14,
                border: 'none',
                borderBottom: '1px solid var(--border)',
                background: active ? 'var(--accent-light)' : 'transparent',
                cursor: 'pointer'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phone || '-'}
                  </div>
                  {it?.need_human && (
                    <span
                      className="text-small"
                      style={{
                        background: 'var(--danger-light)',
                        color: 'var(--danger)',
                        padding: '2px 8px',
                        borderRadius: 999
                      }}
                    >
                      Humano
                    </span>
                  )}
                </div>
                <div className="text-small" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {formatWhen(it?.updated_at)}
                </div>
              </div>
              <div
                className="text-small"
                style={{
                  color: 'var(--text-secondary)',
                  marginTop: 8,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}
              >
                {String(it?.last_preview || '') || '—'}
              </div>
              {it?.lead_id && (
                <div style={{ marginTop: 8 }}>
                  <button
                    className="btn btn-secondary"
                    style={{ padding: '6px 10px' }}
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      window.location.href = `/lead/${encodeURIComponent(String(it.lead_id))}`;
                    }}
                  >
                    Abrir lead
                  </button>
                </div>
              )}
            </button>
          );
        })}
        {items.length === 0 && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Nenhuma conversa.</div>}
        {loadingMore && <div style={{ padding: 12, color: 'var(--text-secondary)' }}>Carregando mais…</div>}
      </div>
    </div>
  );

  const threadPanel = (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
      <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {isMobile && (
            <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => setSelectedPhone('')}>
              Voltar
            </button>
          )}
          <div style={{ fontWeight: 700 }}>{selectedPhone || '—'}</div>
        </div>
        <button className="btn btn-secondary" style={{ padding: '6px 10px' }} onClick={() => loadThread(selectedPhone)} disabled={!selectedPhone}>
          Recarregar
        </button>
      </div>

      {selected?.summary?.text && (
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
          <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
            Resumo
          </div>
          <div className="text-small" style={{ whiteSpace: 'pre-wrap' }}>{selected.summary.text}</div>
        </div>
      )}

      <div style={{ padding: 12, maxHeight: isMobile ? '58vh' : '58vh', overflow: 'auto' }}>
        {(selected?.messages || []).map((m, idx) => {
          const role = m?.role === 'assistant' ? 'assistant' : 'user';
          const mine = role === 'assistant';
          return (
            <div key={idx} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div
                style={{
                  maxWidth: 720,
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: mine ? 'var(--accent-light)' : 'var(--border)',
                  color: 'var(--text)',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {String(m?.content || '')}
                <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
                  {formatWhen(m?.timestamp)}
                </div>
              </div>
            </div>
          );
        })}
        {(selected?.messages || []).length === 0 && <div style={{ color: 'var(--text-secondary)' }}>Sem mensagens.</div>}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-outline" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => applyWrapToDraft('*')} type="button">
              Negrito
            </button>
            <button className="btn btn-outline" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => applyWrapToDraft('_')} type="button">
              Itálico
            </button>
            <button className="btn btn-outline" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => applyWrapToDraft('~')} type="button">
              Riscado
            </button>
            <button className="btn btn-outline" style={{ minHeight: 34, padding: '0 12px' }} onClick={() => applyWrapToDraft('```')} type="button">
              Mono
            </button>
            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-outline"
                style={{ minHeight: 34, padding: '0 12px' }}
                onClick={() => setEmojiOpen((v) => !v)}
                type="button"
                aria-expanded={emojiOpen}
              >
                Emojis
              </button>
              {emojiOpen && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 40,
                    left: 0,
                    width: 260,
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: 'var(--shadow)',
                    padding: 10,
                    zIndex: 50
                  }}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
                    {emojis.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => {
                          insertAtCursor(em);
                          setEmojiOpen(false);
                        }}
                        style={{
                          minHeight: 30,
                          padding: 0,
                          borderRadius: 10,
                          background: 'transparent',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <span style={{ fontSize: 18, lineHeight: '18px' }}>{em}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
            WhatsApp: *negrito* _itálico_ ~riscado~
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
                const k = String(e.key || '').toLowerCase();
                if (k === 'b') {
                  e.preventDefault();
                  applyWrapToDraft('*');
                  return;
                }
                if (k === 'i') {
                  e.preventDefault();
                  applyWrapToDraft('_');
                  return;
                }
              }
              if (e.key === 'Escape') setEmojiOpen(false);
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendManual();
              }
            }}
            placeholder="Responder manualmente…"
            className="form-input"
            rows={3}
            style={{ flex: 1, resize: 'vertical', minHeight: 88 }}
          />
          <button className="btn btn-primary" onClick={sendManual} disabled={sending || !draft.trim() || !selectedPhone}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="container" style={{ paddingTop: 18, paddingBottom: 30, maxWidth: 1200, width: '100%' }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Inbox WhatsApp</h2>
          <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            {loading ? 'Carregando…' : `${items.length} conversas${lastUpdatedAt ? ` • atualizado ${formatWhen(lastUpdatedAt)}` : ''}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por telefone…"
            className="form-input"
            style={{ width: 220 }}
          />
          <button className="btn btn-secondary" onClick={() => loadList({ reset: true })} disabled={loading}>
            Atualizar
          </button>
          <button className="btn btn-outline" onClick={() => setAutoRefresh((v) => !v)} title="Atualiza automaticamente a cada 15s">
            Auto: {autoRefresh ? 'On' : 'Off'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 10, borderRadius: 10, marginBottom: 12 }}>
          {error}
        </div>
      )}

      {isMobile ? (
        <div>{selectedPhone ? threadPanel : listPanel}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 380px) minmax(0, 1fr)', gap: 14 }}>
          {listPanel}
          {threadPanel}
        </div>
      )}
    </div>
  );
}
