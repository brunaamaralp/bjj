import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import { friendlyError } from '../../lib/errorMessages';
import {
  DEFAULT_ACADEMY_TURMAS,
  mergeTurmasIntoSettings,
  readAcademyTurmas,
} from '../../lib/academyTurmas.js';

export default function AcademyTurmasSection({ academyId, academyDataVersion = 0 }) {
  const addToast = useUiStore((s) => s.addToast);
  const [academyDoc, setAcademyDoc] = useState(null);
  const [turmas, setTurmas] = useState([...DEFAULT_ACADEMY_TURMAS]);
  const [newTurma, setNewTurma] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDigest, setSavedDigest] = useState('');

  const role = useUserRole(academyDoc);
  const canEdit = role === 'owner' || role === 'admin';

  useEffect(() => {
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setAcademyDoc(doc);
        const list = readAcademyTurmas(doc.settings);
        setTurmas(list);
        setSavedDigest(JSON.stringify(list));
      } catch (e) {
        console.error('[AcademyTurmas]', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, academyDataVersion]);

  const hasUnsaved = useMemo(() => JSON.stringify(turmas) !== savedDigest, [turmas, savedDigest]);

  const saveTurmas = async (list) => {
    if (!academyId || !canEdit) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeTurmasIntoSettings(doc.settings, list);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setSavedDigest(JSON.stringify(list));
      addToast({ type: 'success', message: 'Turmas salvas.' });
    } catch (e) {
      console.error('[AcademyTurmas] save:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const label = String(newTurma || '').trim();
    if (!label) return;
    const lower = label.toLowerCase();
    if (turmas.some((t) => t.toLowerCase() === lower)) {
      addToast({ type: 'warning', message: 'Esta turma já existe na lista.' });
      return;
    }
    setTurmas((prev) => [...prev, label]);
    setNewTurma('');
  };

  const removeTurma = (idx) => {
    const next = turmas.filter((_, i) => i !== idx);
    if (next.length === 0) {
      addToast({ type: 'warning', message: 'Mantenha pelo menos uma turma na lista.' });
      return;
    }
    setTurmas(next);
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h4 className="text-small" style={{ fontWeight: 700, marginBottom: 4 }}>
        Turmas
      </h4>
      <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
        Opções do campo Turma em cadastros, perfis e filtros.
      </p>

      <ol style={{ listStyle: 'none', padding: 0, margin: '0 0 12px' }}>
        {turmas.map((item, idx) => (
          <li
            key={`${item}-${idx}`}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 8,
              padding: '8px 10px',
              borderBottom: '1px solid var(--border-light)',
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1.4, flex: 1 }}>
              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>{idx + 1}.</span>
              {item}
            </span>
            {canEdit ? (
              <button
                type="button"
                className="btn-action-ghost"
                aria-label={`Remover turma ${idx + 1}`}
                onClick={() => removeTurma(idx)}
                style={{ padding: 4, color: 'var(--text-muted)', flexShrink: 0 }}
              >
                <X size={16} />
              </button>
            ) : null}
          </li>
        ))}
      </ol>

      {canEdit ? (
        <>
          <div className="flex gap-2" style={{ marginBottom: 12 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              value={newTurma}
              onChange={(e) => setNewTurma(e.target.value)}
              placeholder="Nova turma"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAdd();
                }
              }}
            />
            <button type="button" className="btn-outline" onClick={handleAdd} disabled={!newTurma.trim()}>
              <Plus size={16} /> Adicionar
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-primary" disabled={saving || !hasUnsaved} onClick={() => void saveTurmas(turmas)}>
              {saving ? 'Salvando…' : 'Salvar turmas'}
            </button>
            <button type="button" className="btn-outline" onClick={() => setTurmas([...DEFAULT_ACADEMY_TURMAS])}>
              Restaurar padrão
            </button>
          </div>
        </>
      ) : (
        <p className="text-small text-light">Somente administradores podem editar esta lista.</p>
      )}
    </div>
  );
}
