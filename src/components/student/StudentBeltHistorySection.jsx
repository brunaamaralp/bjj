import React, { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import GraduationSelect from '../students/GraduationSelect.jsx';
import {
  BELT_HISTORY_MAX,
  createBeltHistoryEntry,
  sortBeltHistory,
} from '../../lib/beltHistory.js';

function formatDateLabel(ymd) {
  const s = String(ymd || '').trim();
  if (!s) return 'Data desconhecida';
  const [y, m, d] = s.split('-');
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
}

/**
 * Histórico manual de promoções (fonte da verdade da faixa atual).
 */
export default function StudentBeltHistorySection({
  entries = [],
  beltOptions = [],
  beltLabel = 'Faixa',
  disabled = false,
  saving = false,
  onSave,
}) {
  const [draftBelt, setDraftBelt] = useState('');
  const [draftDate, setDraftDate] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBelt, setEditBelt] = useState('');
  const [editDate, setEditDate] = useState('');
  const [localError, setLocalError] = useState('');

  const orderedNewestFirst = useMemo(
    () => [...sortBeltHistory(entries)].reverse(),
    [entries]
  );

  const persist = async (next) => {
    setLocalError('');
    try {
      await onSave?.(next);
    } catch (e) {
      setLocalError(String(e?.message || e || 'Não foi possível salvar.').slice(0, 200));
      throw e;
    }
  };

  const handleAdd = async () => {
    const belt = String(draftBelt || '').trim();
    if (!belt) {
      setLocalError(`Selecione uma ${String(beltLabel).toLowerCase()}.`);
      return;
    }
    if (entries.length >= BELT_HISTORY_MAX) {
      setLocalError(`Máximo de ${BELT_HISTORY_MAX} promoções no histórico.`);
      return;
    }
    const entry = createBeltHistoryEntry({ belt, date: draftDate });
    if (!entry) return;
    await persist([...entries, entry]);
    setDraftBelt('');
    setDraftDate('');
  };

  const startEdit = (entry) => {
    setEditingId(entry.id);
    setEditBelt(entry.belt);
    setEditDate(entry.date || '');
    setLocalError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBelt('');
    setEditDate('');
  };

  const saveEdit = async () => {
    const belt = String(editBelt || '').trim();
    if (!belt) {
      setLocalError(`Selecione uma ${String(beltLabel).toLowerCase()}.`);
      return;
    }
    const next = entries.map((e) =>
      e.id === editingId ? { ...e, belt, date: String(editDate || '').trim().slice(0, 10) } : e
    );
    await persist(next);
    cancelEdit();
  };

  const removeEntry = async (id) => {
    await persist(entries.filter((e) => e.id !== id));
    if (editingId === id) cancelEdit();
  };

  return (
    <div className="profile-section-block student-belt-history-section">
      <h3 className="profile-section-heading">Histórico de {String(beltLabel).toLowerCase()}</h3>
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
        A {String(beltLabel).toLowerCase()} atual do aluno é sempre a última promoção deste histórico.
      </p>

      {orderedNewestFirst.length > 0 ? (
        <ul style={{ listStyle: 'none', margin: '0 0 12px', padding: 0 }}>
          {orderedNewestFirst.map((entry) => (
            <li
              key={entry.id}
              style={{
                padding: '10px 0',
                borderBottom: '0.5px solid var(--border-light)',
              }}
            >
              {editingId === entry.id ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <GraduationSelect
                    id={`belt-hist-edit-${entry.id}`}
                    value={editBelt}
                    options={beltOptions}
                    ariaLabel={beltLabel}
                    disabled={disabled || saving}
                    emptyLabel="Selecione…"
                    onChange={setEditBelt}
                    className="student-profile-data-input student-profile-data-input--select"
                  />
                  <input
                    type="date"
                    className="student-profile-data-input"
                    value={editDate}
                    disabled={disabled || saving}
                    onChange={(e) => setEditDate(e.target.value)}
                    aria-label="Data da promoção"
                  />
                  <button type="button" className="btn-action-ghost" disabled={saving} onClick={() => void saveEdit()}>
                    Salvar
                  </button>
                  <button type="button" className="btn-action-ghost" disabled={saving} onClick={cancelEdit}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{entry.belt}</div>
                    <div className="text-xs text-muted">{formatDateLabel(entry.date)}</div>
                  </div>
                  {!disabled ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        type="button"
                        className="btn-icon btn-icon--ghost"
                        aria-label={`Editar ${entry.belt}`}
                        disabled={saving}
                        onClick={() => startEdit(entry)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-icon--ghost"
                        aria-label={`Excluir ${entry.belt}`}
                        disabled={saving}
                        onClick={() => void removeEntry(entry.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-muted" style={{ margin: '0 0 12px' }}>
          Nenhuma promoção registrada ainda.
        </p>
      )}

      {!disabled ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 140, flex: '1 1 140px' }}>
            <label className="text-xs text-muted" htmlFor="belt-hist-add-belt">
              {beltLabel}
            </label>
            <GraduationSelect
              id="belt-hist-add-belt"
              value={draftBelt}
              options={beltOptions}
              ariaLabel={beltLabel}
              disabled={saving || entries.length >= BELT_HISTORY_MAX}
              emptyLabel="Selecione…"
              onChange={setDraftBelt}
              className="student-profile-data-input student-profile-data-input--select"
            />
          </div>
          <div style={{ minWidth: 140 }}>
            <label className="text-xs text-muted" htmlFor="belt-hist-add-date">
              Data (opcional)
            </label>
            <input
              id="belt-hist-add-date"
              type="date"
              className="student-profile-data-input"
              value={draftDate}
              disabled={saving || entries.length >= BELT_HISTORY_MAX}
              onChange={(e) => setDraftDate(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn-action-ghost"
            disabled={saving || entries.length >= BELT_HISTORY_MAX}
            onClick={() => void handleAdd()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} />
            Adicionar
          </button>
        </div>
      ) : null}

      {localError ? (
        <p className="text-small" style={{ color: 'var(--danger, #b91c1c)', margin: '8px 0 0' }}>
          {localError}
        </p>
      ) : null}
    </div>
  );
}
