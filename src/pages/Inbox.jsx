import React, { useEffect, useMemo, useState } from 'react';
import { account } from '../lib/appwrite';

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
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const normalizedSearch = useMemo(() => normalizePhone(search), [search]);

  async function loadList() {
    setError('');
    setLoading(true);
    try {
      const jwt = await getJwt();
      const qs = new URLSearchParams();
      qs.set('limit', '50');
      if (normalizedSearch) qs.set('search', normalizedSearch);
      const resp = await fetch(`/api/conversations?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(raw || 'Falha ao carregar conversas');
      const data = JSON.parse(raw);
      const next = Array.isArray(data?.items) ? data.items : [];
      setItems(next);
      if (!selectedPhone && next.length > 0) setSelectedPhone(String(next[0].phone_number || ''));
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setLoading(false);
    }
  }

  async function loadThread(phone) {
    const p = String(phone || '').trim();
    if (!p) return;
    setError('');
    try {
      const jwt = await getJwt();
      const resp = await fetch(`/api/conversations/${encodeURIComponent(p)}`, {
        headers: { Authorization: `Bearer ${jwt}` }
      });
      const raw = await resp.text();
      if (!resp.ok) throw new Error(raw || 'Falha ao carregar conversa');
      const data = JSON.parse(raw);
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const summary = data?.summary && typeof data.summary === 'object' ? data.summary : null;
      setSelected({ phone: p, messages, summary });
    } catch (e) {
      setError(e?.message || 'Erro');
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
      if (!resp.ok) throw new Error(raw || 'Falha ao enviar');
      const nowIso = new Date().toISOString();
      setSelected((prev) => {
        if (!prev || prev.phone !== phone) return prev;
        const msgs = Array.isArray(prev.messages) ? prev.messages.slice() : [];
        msgs.push({ role: 'assistant', content: text, timestamp: nowIso });
        return { ...prev, messages: msgs.slice(-50) };
      });
      setDraft('');
      await loadList();
    } catch (e) {
      setError(e?.message || 'Erro');
    } finally {
      setSending(false);
    }
  }

  useEffect(() => {
    loadList();
  }, [normalizedSearch]);

  useEffect(() => {
    if (selectedPhone) loadThread(selectedPhone);
  }, [selectedPhone]);

  return (
    <div className="container" style={{ paddingTop: 18, paddingBottom: 30 }}>
      <div className="flex" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Inbox WhatsApp</h2>
          <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
            {loading ? 'Carregando…' : `${items.length} conversas`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por telefone…"
            className="form-input"
            style={{ width: 220 }}
          />
          <button className="btn btn-secondary" onClick={loadList} disabled={loading}>
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', padding: 10, borderRadius: 10, marginBottom: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 14 }}>
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Conversas</div>
          <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
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
                    padding: 12,
                    border: 'none',
                    borderBottom: '1px solid var(--border)',
                    background: active ? 'var(--accent-light)' : 'transparent',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <div style={{ fontWeight: 700 }}>{phone || '-'}</div>
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
                    <div className="text-small" style={{ color: 'var(--text-secondary)' }}>
                      {formatWhen(it?.updated_at)}
                    </div>
                  </div>
                  <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
                    {String(it?.last_preview || '') || '—'}
                  </div>
                  {it?.lead_id && (
                    <div style={{ marginTop: 8 }}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 10px' }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
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
          </div>
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)' }}>
          <div style={{ padding: 10, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700 }}>{selectedPhone || '—'}</div>
          </div>

          {selected?.summary?.text && (
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)', background: 'rgba(0,0,0,0.02)' }}>
              <div className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 700, marginBottom: 6 }}>
                Resumo
              </div>
              <div className="text-small" style={{ whiteSpace: 'pre-wrap' }}>{selected.summary.text}</div>
            </div>
          )}

          <div style={{ padding: 12, maxHeight: '58vh', overflow: 'auto' }}>
            {(selected?.messages || []).map((m, idx) => {
              const role = m?.role === 'assistant' ? 'assistant' : 'user';
              const mine = role === 'assistant';
              return (
                <div key={idx} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
                  <div
                    style={{
                      maxWidth: 560,
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

          <div style={{ padding: 12, borderTop: '1px solid var(--border)', display: 'flex', gap: 10 }}>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Responder manualmente…"
              className="form-input"
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" onClick={sendManual} disabled={sending || !draft.trim()}>
              {sending ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
