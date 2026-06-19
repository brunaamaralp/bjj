import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { useUserRole } from '../../lib/useUserRole';
import { useTerms } from '../../lib/terminology.js';
import {
  DEFAULT_BELT_GRADES,
  mergeBeltGradesIntoSettings,
  parseBeltGradesFromSettings,
  parseBeltGradesList,
  serializeBeltGrades,
} from '../../lib/beltGradesConfig.js';

export default function BeltGradesSection({ academyId, academy, setAcademy, academyDataVersion = 0 }) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const canEdit = role === 'owner' || role === 'admin';
  const [grades, setGrades] = useState([]);
  const [newGrade, setNewGrade] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedDigest, setSavedDigest] = useState('');

  useEffect(() => {
    if (!academyId) return;
    const list = parseBeltGradesFromSettings(academy?.settings);
    setGrades(list);
    setSavedDigest(serializeBeltGrades(list));
  }, [academyId, academy?.settings, academyDataVersion]);

  const hasUnsaved = useMemo(
    () => serializeBeltGrades(grades) !== savedDigest,
    [grades, savedDigest]
  );

  const persist = async (list) => {
    if (!academyId || !canEdit) return;
    setSaving(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeBeltGradesIntoSettings(doc.settings, list);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setAcademy((a) => ({ ...a, settings: JSON.stringify(merged) }));
      setSavedDigest(serializeBeltGrades(list));
      addToast({ type: 'success', message: `${terms.belt}s salvas.` });
    } catch (e) {
      console.error('save belt grades:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    const label = String(newGrade || '').trim();
    if (!label) return;
    const lower = label.toLowerCase();
    if (grades.some((g) => g.toLowerCase() === lower)) {
      addToast({ type: 'warning', message: 'Esta graduação já existe na lista.' });
      return;
    }
    setGrades((prev) => [...prev, label]);
    setNewGrade('');
  };

  const removeAt = (idx) => {
    const next = grades.filter((_, i) => i !== idx);
    setGrades(next);
  };

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
        Níveis de evolução do aluno (faixa, módulo, fase…). Salve a lista para exibir no cadastro. Deixe
        vazio para ocultar.
      </p>
      <div className="card" style={{ padding: 16 }}>
        <ol className="students-settings-list">
          {(grades.length ? grades : DEFAULT_BELT_GRADES).map((item, idx) => (
            <li key={`${item}-${idx}`} className="students-settings-list__item">
              <span className="students-settings-list__text">
                <span className="students-settings-list__index">{idx + 1}.</span>
                {item}
                {!grades.length ? (
                  <span className="text-small text-muted" style={{ marginLeft: 8 }}>
                    (exemplo — salve para ativar)
                  </span>
                ) : null}
              </span>
              {canEdit && grades.length ? (
                <button
                  type="button"
                  className="btn-action-ghost"
                  aria-label={`Remover ${item}`}
                  onClick={() => removeAt(idx)}
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
                value={newGrade}
                onChange={(e) => setNewGrade(e.target.value)}
                placeholder={`Nova ${terms.belt.toLowerCase()}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAdd();
                  }
                }}
              />
              <button type="button" className="btn-outline" onClick={handleAdd} disabled={!newGrade.trim()}>
                <Plus size={16} /> Adicionar
              </button>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              {hasUnsaved ? (
                <span className="funil-unsaved-pill" role="status">
                  Alterações não salvas
                </span>
              ) : null}
              <button
                type="button"
                className="btn-primary"
                disabled={saving || !hasUnsaved}
                onClick={() => void persist(parseBeltGradesList(grades))}
              >
                {saving ? 'Salvando…' : 'Salvar graduações'}
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setGrades([...DEFAULT_BELT_GRADES]);
                  addToast({
                    type: 'info',
                    message: 'Padrões restaurados — clique em Salvar para confirmar.',
                  });
                }}
              >
                Restaurar padrões
              </button>
            </div>
          </>
        ) : (
          <p className="text-small text-light">Somente administradores podem editar esta lista.</p>
        )}
      </div>
    </div>
  );
}
