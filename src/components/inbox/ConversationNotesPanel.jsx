import React, { useEffect, useState } from 'react';
import { account } from '../../lib/appwrite';
import { Loader2, Trash2 } from 'lucide-react';

const MAX_LEN = 4000;

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

function formatNoteWhen(iso) {
  const s = String(iso || '').trim();
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ConversationNotesPanel({ academyId, conversationId, addToast }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [featureOn, setFeatureOn] = useState(true);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    const cid = String(conversationId || '').trim();
    if (!aid || !cid) {
      setNotes([]);
      setFeatureOn(true);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const jwt = await getJwt();
        const qs = new URLSearchParams({ conversation_id: cid, academy_id: aid });
        const res = await fetch(`/api/conversation-notes?${qs}`, {
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.sucesso) {
          throw new Error(data?.erro || 'Falha ao carregar notas');
        }
        if (data.configurado === false) {
          setFeatureOn(false);
          setNotes([]);
          return;
        }
        setFeatureOn(true);
        setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch (e) {
        if (!cancelled) {
          addToast?.({ type: 'error', message: e?.message || 'Erro ao carregar notas' });
          setNotes([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, conversationId, addToast]);

  async function handleAdd(e) {
    e?.preventDefault?.();
    const aid = String(academyId || '').trim();
    const cid = String(conversationId || '').trim();
    const text = String(draft || '').trim();
    if (!aid || !cid || !text || saving || !featureOn) return;
    if (text.length > MAX_LEN) {
      addToast?.({ type: 'error', message: `Nota muito longa (máx. ${MAX_LEN} caracteres)` });
      return;
    }
    setSaving(true);
    try {
      const jwt = await getJwt();
      const res = await fetch('/api/conversation-notes', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': aid,
        },
        body: JSON.stringify({ academy_id: aid, conversation_id: cid, body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || 'Falha ao salvar');
      setDraft('');
      setNotes((prev) => [data.note, ...prev]);
      addToast?.({ type: 'success', message: 'Nota salva' });
    } catch (e) {
      addToast?.({ type: 'error', message: e?.message || 'Erro ao salvar nota' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(noteId) {
    const id = String(noteId || '').trim();
    const aid = String(academyId || '').trim();
    if (!id || !aid || deletingId) return;
    setDeletingId(id);
    try {
      const jwt = await getJwt();
      const qs = new URLSearchParams({ academy_id: aid });
      const res = await fetch(`/api/conversation-notes/${encodeURIComponent(id)}?${qs}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.sucesso) throw new Error(data?.erro || 'Falha ao excluir');
      setNotes((prev) => prev.filter((n) => String(n.$id) !== id));
      addToast?.({ type: 'success', message: 'Nota removida' });
    } catch (e) {
      addToast?.({ type: 'error', message: e?.message || 'Erro ao excluir' });
    } finally {
      setDeletingId('');
    }
  }

  if (!String(conversationId || '').trim()) {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
        <div className="navi-section-heading" style={{ marginBottom: 8 }}>
          Notas internas
        </div>
        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: 0 }}>
          Selecione uma conversa para ver e criar notas visíveis só para a equipe.
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 12 }}>
      <div className="navi-section-heading" style={{ marginBottom: 8 }}>
        Notas internas
      </div>
      {!featureOn && (
        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 10px' }}>
          Este recurso ainda não está ativo no servidor (coleção não configurada).
        </p>
      )}
      {featureOn && (
        <form onSubmit={handleAdd} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <textarea
            className="form-input"
            rows={3}
            placeholder="Lembrete para a equipe (não é enviado ao cliente)…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={saving || loading}
            maxLength={MAX_LEN}
            style={{ resize: 'vertical', minHeight: 72 }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" type="submit" disabled={saving || loading || !String(draft || '').trim()}>
              {saving ? 'Salvando…' : 'Adicionar nota'}
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <div className="text-small" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)' }}>
          <Loader2 size={16} className="inbox-improve-spin" aria-hidden />
          Carregando…
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 }}>
          {notes.length === 0 && featureOn && (
            <li className="text-small" style={{ color: 'var(--text-secondary)' }}>
              Nenhuma nota ainda.
            </li>
          )}
          {notes.map((n) => (
            <li
              key={n.$id}
              style={{
                border: '1px solid var(--border-light)',
                borderRadius: 10,
                padding: '10px 10px 8px',
                background: 'var(--surface-elevated, var(--surface))',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', color: 'var(--ink)', flex: 1, minWidth: 0 }}>
                  {n.body}
                </div>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '4px 8px', minHeight: 32, flexShrink: 0 }}
                  onClick={() => handleDelete(n.$id)}
                  disabled={deletingId === n.$id}
                  title="Excluir nota"
                  aria-label="Excluir nota"
                >
                  {deletingId === n.$id ? <Loader2 size={16} className="inbox-improve-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
                </button>
              </div>
              <div className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
                {formatNoteWhen(n.created_at)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
