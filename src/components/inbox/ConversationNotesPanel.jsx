import React, { useEffect, useState } from 'react';
import { account } from '../../lib/appwrite';
import { useLeadStore } from '../../store/useLeadStore';
import { useNoteNotifications } from '../../hooks/useNoteNotifications';
import { Loader2, Trash2, Pencil, Check, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

export default function ConversationNotesPanel({ conversationId, addToast }) {
  const academyId = useLeadStore((s) => s.academyId);
  const userId = useLeadStore((s) => s.userId);
  const { notifications, markAsRead } = useNoteNotifications(academyId, userId);

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [featureOn, setFeatureOn] = useState(true);
  const [editingNoteId, setEditingNoteId] = useState(null);
  const [editingContent, setEditingContent] = useState('');
  const [editingBusy, setEditingBusy] = useState(false);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    const cid = String(conversationId || '').trim();
    
    // Marcar como lida ao abrir conversa
    const currentConvNotifications = notifications.filter(n => n.conversation_id === cid);
    if (currentConvNotifications.length > 0) {
      markAsRead(currentConvNotifications.map(n => n.id));
    }

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
  }, [academyId, conversationId, addToast, notifications, markAsRead]);

  async function postNoteBody(text) {
    const aid = String(academyId || '').trim();
    const cid = String(conversationId || '').trim();
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
    return data.note;
  }

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
      const note = await postNoteBody(text);
      setDraft('');
      setNotes((prev) => [note, ...prev]);
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
    const backupBody = String(notes.find((n) => String(n.$id) === id)?.body || '');
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
      const canUndo = String(backupBody || '').trim().length > 0;
      addToast?.({
        type: 'info',
        message: 'Nota excluída',
        duration: 5000,
        ...(canUndo
          ? {
              action: {
                label: 'Desfazer',
                onClick: () => {
                  void (async () => {
                    try {
                      const note = await postNoteBody(backupBody);
                      setNotes((prev) => [note, ...prev]);
                      addToast?.({ type: 'success', message: 'Nota restaurada' });
                    } catch (e) {
                      addToast?.({ type: 'error', message: e?.message || 'Não foi possível desfazer.' });
                    }
                  })();
                },
              },
            }
          : {}),
      });
    } catch (e) {
      addToast?.({ type: 'error', message: e?.message || 'Erro ao excluir' });
    } finally {
      setDeletingId('');
    }
  }
  async function handleEditNote(noteId, content) {
    if (!String(content || '').trim()) return;
    const aid = String(academyId || '').trim();
    setEditingBusy(true);

    try {
      const jwt = await getJwt();
      const res = await fetch(`/api/conversation-notes/${noteId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
          'x-academy-id': aid
        },
        body: JSON.stringify({ body: content.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data?.sucesso) {
        throw new Error(data?.erro || 'Erro ao salvar edição');
      }

      setNotes(prev => prev.map(n => 
        n.$id === noteId 
          ? { ...n, body: data.note.body, edited_at: data.note.edited_at, edited_by_name: data.note.edited_by_name } 
          : n
      ));
      setEditingNoteId(null);
      setEditingContent('');
    } catch (e) {
      addToast?.({ type: 'error', message: e?.message || 'Erro ao editar nota' });
    } finally {
      setEditingBusy(false);
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
          <div className="note-input-wrapper" style={{ display: 'grid', gap: 4 }}>
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
            <span
              className="text-small"
              style={{
                textAlign: 'right',
                color: draft.length > 3800 ? 'var(--warning)' : 'var(--text-secondary)',
              }}
            >
              {draft.length}/{MAX_LEN}
            </span>
          </div>
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
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingNoteId === n.$id ? (
                    <div style={{ display: 'grid', gap: 8 }}>
                      <textarea
                        className="form-input"
                        rows={3}
                        autoFocus
                        value={editingContent}
                        onChange={(e) => setEditingContent(e.target.value)}
                        disabled={editingBusy}
                        style={{ width: '100%', minHeight: 80, fontSize: '0.92rem', resize: 'vertical' }}
                      />
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-ghost" 
                          style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                          onClick={() => { setEditingNoteId(null); setEditingContent(''); }}
                          disabled={editingBusy}
                        >
                          <X size={14} style={{ marginRight: 4 }} /> Cancelar
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                          onClick={() => handleEditNote(n.$id, editingContent)}
                          disabled={editingBusy || !editingContent.trim()}
                        >
                          <Check size={14} style={{ marginRight: 4 }} /> {editingBusy ? 'Salvando...' : 'Salvar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', color: 'var(--ink)', lineHeight: 1.5 }}>
                        {n.body}
                      </div>
                      {n.edited_at && (
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: 4 }}>
                          editado · {formatDistanceToNow(new Date(n.edited_at), { addSuffix: true, locale: ptBR })}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      disabled={deletingId || editingBusy}
                      onClick={() => {
                        setEditingNoteId(n.$id);
                        setEditingContent(n.body);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'color 0.2s',
                      }}
                      title="Editar"
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      disabled={deletingId || editingBusy}
                      onClick={() => handleDelete(n.$id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 4,
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        transition: 'color 0.2s',
                      }}
                      title="Excluir"
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                    >
                      {deletingId === n.$id ? <Loader2 size={15} className="inbox-improve-spin" /> : <Trash2 size={15} />}
                    </button>
                  </div>
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
