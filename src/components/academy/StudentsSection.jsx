import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { friendlyError } from '../../lib/errorMessages';
import { useUserRole } from '../../lib/useUserRole';
import {
  DEFAULT_STUDENT_EXIT_REASONS,
  mergeExitReasonsIntoSettings,
  parseStudentExitReasons,
  serializeStudentExitReasons,
} from '../../lib/studentExitConfig.js';
import {
  DEFAULT_STUDENT_FREEZE_REASONS,
  mergeFreezeReasonsIntoSettings,
  parseStudentFreezeReasons,
  serializeStudentFreezeReasons,
} from '../../lib/studentFreezeConfig.js';
import AcademyTurmasSection from './AcademyTurmasSection.jsx';

function ListSubsectionHeader({ title, hasUnsaved }) {
  return (
    <div className="flex justify-between items-center" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
      <p className="funil-section-subheading" style={{ margin: 0 }}>
        {title}
      </p>
      {hasUnsaved ? (
        <span className="funil-unsaved-pill" role="status">
          Alterações não salvas
        </span>
      ) : null}
    </div>
  );
}

function EditableStringList({
  hint,
  items,
  canEdit,
  saving,
  hasUnsaved,
  newValue,
  onNewValueChange,
  onAdd,
  onRemove,
  onSave,
  onResetDefaults,
  placeholder,
  saveLabel,
  resetLabel,
}) {
  return (
    <div>
      {hint ? (
        <p className="text-small" style={{ color: 'var(--text-secondary)', margin: '0 0 10px', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}

      <ol
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '0 0 12px',
          counterReset: 'checklist-item',
        }}
      >
        {items.map((item, idx) => (
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
                aria-label={`Remover item ${idx + 1}`}
                onClick={() => onRemove(idx)}
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
              value={newValue}
              onChange={(e) => onNewValueChange(e.target.value)}
              placeholder={placeholder}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onAdd();
                }
              }}
            />
            <button type="button" className="btn-outline" onClick={onAdd} disabled={!newValue.trim()}>
              <Plus size={16} /> Adicionar
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button type="button" className="btn-primary" disabled={saving || !hasUnsaved} onClick={onSave}>
              {saving ? 'Salvando…' : saveLabel}
            </button>
            <button type="button" className="btn-outline" onClick={onResetDefaults}>
              {resetLabel}
            </button>
          </div>
        </>
      ) : (
        <p className="text-small text-light">Somente administradores podem editar esta lista.</p>
      )}
    </div>
  );
}

const StudentsSection = ({ academy, setAcademy, academyId, academyDataVersion = 0 }) => {
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const canEdit = role === 'owner' || role === 'admin';

  const [newReason, setNewReason] = useState('');
  const [savingReasons, setSavingReasons] = useState(false);
  const [savedReasonsDigest, setSavedReasonsDigest] = useState('');
  const [newFreezeReason, setNewFreezeReason] = useState('');
  const [savingFreezeReasons, setSavingFreezeReasons] = useState(false);
  const [savedFreezeReasonsDigest, setSavedFreezeReasonsDigest] = useState('');

  const reasons = useMemo(
    () => parseStudentExitReasons(academy.studentExitReasons),
    [academy.studentExitReasons]
  );
  const freezeReasons = useMemo(
    () => parseStudentFreezeReasons(academy.studentFreezeReasons),
    [academy.studentFreezeReasons]
  );

  useEffect(() => {
    if (!academyId) return;
    setSavedReasonsDigest(serializeStudentExitReasons(academy.studentExitReasons));
    setSavedFreezeReasonsDigest(serializeStudentFreezeReasons(academy.studentFreezeReasons));
  }, [academyId, academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUnsavedReasons = useMemo(
    () => serializeStudentExitReasons(academy.studentExitReasons) !== savedReasonsDigest,
    [academy.studentExitReasons, savedReasonsDigest]
  );
  const hasUnsavedFreezeReasons = useMemo(
    () => serializeStudentFreezeReasons(academy.studentFreezeReasons) !== savedFreezeReasonsDigest,
    [academy.studentFreezeReasons, savedFreezeReasonsDigest]
  );

  const notifyRestoreDefaults = () => {
    addToast({
      type: 'info',
      message: 'Padrões restaurados — clique em Salvar para confirmar.',
    });
  };

  const saveReasons = async (list) => {
    if (!academyId || !canEdit) return;
    setSavingReasons(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeExitReasonsIntoSettings(doc.settings, list);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setAcademy((a) => ({ ...a, studentExitReasons: list }));
      setSavedReasonsDigest(serializeStudentExitReasons(list));
      addToast({ type: 'success', message: 'Motivos de desligamento salvos.' });
    } catch (e) {
      console.error('save exit reasons:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingReasons(false);
    }
  };

  const handleAddReason = () => {
    const label = String(newReason || '').trim();
    if (!label) return;
    const lower = label.toLowerCase();
    if (reasons.some((r) => r.toLowerCase() === lower)) {
      addToast({ type: 'warning', message: 'Este motivo já existe na lista.' });
      return;
    }
    setAcademy((a) => ({
      ...a,
      studentExitReasons: [...parseStudentExitReasons(a.studentExitReasons), label],
    }));
    setNewReason('');
  };

  const removeReason = (idx) => {
    const next = reasons.filter((_, i) => i !== idx);
    if (next.length === 0) {
      addToast({ type: 'warning', message: 'Mantenha pelo menos um motivo na lista.' });
      return;
    }
    setAcademy((a) => ({ ...a, studentExitReasons: next }));
  };

  const saveFreezeReasons = async (list) => {
    if (!academyId || !canEdit) return;
    setSavingFreezeReasons(true);
    try {
      const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
      const merged = mergeFreezeReasonsIntoSettings(doc.settings, list);
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        settings: JSON.stringify(merged),
      });
      setAcademy((a) => ({ ...a, studentFreezeReasons: list }));
      setSavedFreezeReasonsDigest(serializeStudentFreezeReasons(list));
      addToast({ type: 'success', message: 'Motivos de trancamento salvos.' });
    } catch (e) {
      console.error('save freeze reasons:', e);
      addToast({ type: 'error', message: friendlyError(e, 'save') });
    } finally {
      setSavingFreezeReasons(false);
    }
  };

  const handleAddFreezeReason = () => {
    const label = String(newFreezeReason || '').trim();
    if (!label) return;
    const lower = label.toLowerCase();
    if (freezeReasons.some((r) => r.toLowerCase() === lower)) {
      addToast({ type: 'warning', message: 'Este motivo já existe na lista.' });
      return;
    }
    setAcademy((a) => ({
      ...a,
      studentFreezeReasons: [...parseStudentFreezeReasons(a.studentFreezeReasons), label],
    }));
    setNewFreezeReason('');
  };

  const removeFreezeReason = (idx) => {
    const next = freezeReasons.filter((_, i) => i !== idx);
    if (next.length === 0) {
      addToast({ type: 'warning', message: 'Mantenha pelo menos um motivo na lista.' });
      return;
    }
    setAcademy((a) => ({ ...a, studentFreezeReasons: next }));
  };

  return (
    <section className="empresa-section animate-in" style={{ animationDelay: '0.05s' }}>
      <h3 className="navi-section-heading mb-2">Motivos de saída e trancamento</h3>
      <p className="text-small text-muted mb-3" style={{ lineHeight: 1.45 }}>
        Defina as opções que a equipe vê ao encerrar ou pausar uma matrícula. Para tarefas automáticas ao
        desligar ou matricular, use a{' '}
        <Link to="/automacoes?tab=processos" className="edit-link">
          Automações → Processos
        </Link>
        .
      </p>

      <div className="card">
        <ListSubsectionHeader title="Motivos de desligamento" hasUnsaved={canEdit && hasUnsavedReasons} />
        <EditableStringList
          hint="Motivos exibidos ao encerrar matrícula de um aluno."
          items={reasons}
          canEdit={canEdit}
          saving={savingReasons}
          hasUnsaved={hasUnsavedReasons}
          newValue={newReason}
          onNewValueChange={setNewReason}
          onAdd={handleAddReason}
          onRemove={removeReason}
          onSave={() => void saveReasons(reasons)}
          onResetDefaults={() => {
            setAcademy((a) => ({ ...a, studentExitReasons: [...DEFAULT_STUDENT_EXIT_REASONS] }));
            notifyRestoreDefaults();
          }}
          placeholder="Novo motivo de desligamento"
          saveLabel="Salvar motivos de desligamento"
          resetLabel="Restaurar motivos padrão"
        />

        <div
          className="alunos-inner-divider"
          role="separator"
          aria-hidden="true"
          style={{
            margin: '32px 0 0',
            borderTop: '1px solid var(--border-light)',
            paddingTop: 24,
          }}
        />

        <ListSubsectionHeader title="Motivos de trancamento" hasUnsaved={canEdit && hasUnsavedFreezeReasons} />
        <EditableStringList
          hint="Motivos exibidos ao pausar uma matrícula temporariamente."
          items={freezeReasons}
          canEdit={canEdit}
          saving={savingFreezeReasons}
          hasUnsaved={hasUnsavedFreezeReasons}
          newValue={newFreezeReason}
          onNewValueChange={setNewFreezeReason}
          onAdd={handleAddFreezeReason}
          onRemove={removeFreezeReason}
          onSave={() => void saveFreezeReasons(freezeReasons)}
          onResetDefaults={() => {
            setAcademy((a) => ({ ...a, studentFreezeReasons: [...DEFAULT_STUDENT_FREEZE_REASONS] }));
            notifyRestoreDefaults();
          }}
          placeholder="Novo motivo de trancamento"
          saveLabel="Salvar motivos de trancamento"
          resetLabel="Restaurar motivos padrão"
        />
      </div>

      <div className="funil-section-divider" role="separator" aria-hidden="true" />

      <AcademyTurmasSection academyId={academyId} academyDataVersion={academyDataVersion} />
    </section>
  );
};

export default StudentsSection;
