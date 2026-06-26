import React, { useCallback, useEffect, useState } from 'react';
import '../../styles/portal.css';
import { Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import {
  fetchPortalGuidesManage,
  createPortalGuide,
  updatePortalGuide,
  deletePortalGuide,
} from '../../lib/portalApi';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';

const CATEGORIES = [
  { value: 'geral', label: 'Geral' },
  { value: 'regras', label: 'Regras' },
  { value: 'primeira_aula', label: 'Primeira aula' },
  { value: 'faq', label: 'FAQ' },
];

const EMPTY_FORM = {
  title: '',
  summary: '',
  body_markdown: '',
  category: 'geral',
  published: false,
};

export default function PortalGuidesSection({ academyId, canEdit }) {
  const addToast = useUiStore((s) => s.addToast);
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    if (!academyId) return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchPortalGuidesManage(academyId);
      setGuides(data.guides || []);
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!academyId || !canEdit || busy) return;
    if (!String(form.title || '').trim()) {
      addToast({ type: 'error', message: 'Informe o título.' });
      return;
    }
    setBusy(true);
    try {
      if (editingId) {
        await updatePortalGuide(academyId, { id: editingId, ...form });
        addToast({ type: 'success', message: 'Guia atualizado.' });
      } else {
        await createPortalGuide(academyId, form);
        addToast({ type: 'success', message: 'Guia criado.' });
      }
      resetForm();
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (guide) => {
    setEditingId(guide.id);
    setForm({
      title: guide.title || '',
      summary: guide.summary || '',
      body_markdown: guide.body_markdown || '',
      category: guide.category || 'geral',
      published: guide.published === true,
    });
  };

  const moveGuide = async (guide, direction) => {
    const order = Number(guide.sort_order) || 0;
    const next = order + direction;
    try {
      await updatePortalGuide(academyId, { id: guide.id, sort_order: next });
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || busy) return;
    setBusy(true);
    try {
      await deletePortalGuide(academyId, deleteTarget.id);
      addToast({ type: 'success', message: 'Guia removido.' });
      setDeleteTarget(null);
      if (editingId === deleteTarget.id) resetForm();
      await load();
    } catch (e) {
      addToast({ type: 'error', message: friendlyError(e, 'delete') });
    } finally {
      setBusy(false);
    }
  };

  if (!canEdit) {
    return (
      <p className="info-mini-label">Disponível para titulares e administradores.</p>
    );
  }

  return (
    <div className="empresa-section">
      <h3 className="section-title">Guias do portal</h3>
      <p className="info-mini-label mb-3">
        Conteúdos em Markdown exibidos aos alunos em Orientações.
      </p>
      {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}

      <div className="portal-card" style={{ marginBottom: 16 }}>
        <h4 className="portal-card__title">{editingId ? 'Editar guia' : 'Novo guia'}</h4>
        <div className="portal-field">
          <label htmlFor="portal-guide-title">Título</label>
          <input
            id="portal-guide-title"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </div>
        <div className="portal-field">
          <label htmlFor="portal-guide-summary">Resumo</label>
          <input
            id="portal-guide-summary"
            value={form.summary}
            maxLength={160}
            onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          />
        </div>
        <div className="portal-field">
          <label htmlFor="portal-guide-category">Categoria</label>
          <select
            id="portal-guide-category"
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div className="portal-field">
          <label htmlFor="portal-guide-body">Conteúdo (Markdown)</label>
          <textarea
            id="portal-guide-body"
            rows={8}
            value={form.body_markdown}
            onChange={(e) => setForm((f) => ({ ...f, body_markdown: e.target.value }))}
          />
        </div>
        <label className="student-profile-emergency-check">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
          />
          <span>Publicado no portal</span>
        </label>
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => void handleSave()}>
            {editingId ? 'Salvar' : <><Plus size={16} /> Criar</>}
          </button>
          {editingId ? (
            <button type="button" className="btn-ghost btn-sm" onClick={resetForm}>
              Cancelar
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <p className="info-mini-label">Carregando guias…</p> : null}

      {!loading && guides.length === 0 ? (
        <p className="info-mini-label">Nenhum guia cadastrado.</p>
      ) : null}

      <ul className="list-unstyled">
        {guides.map((g) => (
          <li key={g.id} className="portal-card" style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
              <div>
                <strong>{g.title}</strong>
                <div className="info-mini-label">
                  {g.published ? 'Publicado' : 'Rascunho'} · /{g.slug}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn-ghost btn-sm" aria-label="Subir" onClick={() => void moveGuide(g, -1)}>
                  <ChevronUp size={16} />
                </button>
                <button type="button" className="btn-ghost btn-sm" aria-label="Descer" onClick={() => void moveGuide(g, 1)}>
                  <ChevronDown size={16} />
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => handleEdit(g)}>
                  Editar
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setDeleteTarget(g)}>
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir guia?"
        description="Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        variant="danger"
        busy={busy}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
