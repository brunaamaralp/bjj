import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { databases, DB_ID, ACADEMIES_COL } from '../../lib/appwrite';
import { useUiStore } from '../../store/useUiStore';
import { useUserRole } from '../../lib/useUserRole';
import {
  DEFAULT_STUDENT_EXIT_REASONS,
  parseStudentExitReasons,
  serializeStudentExitReasons,
} from '../../lib/studentExitConfig.js';
import {
  DEFAULT_OFFBOARDING_CHECKLIST,
  parseOffboardingChecklist,
  serializeOffboardingChecklist,
} from '../../lib/studentOffboarding.js';

function EditableStringList({
  title,
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
    <div style={{ marginTop: title ? 24 : 0 }}>
      {title ? (
        <h4 className="text-small" style={{ fontWeight: 700, marginBottom: hint ? 4 : 10 }}>
          {title}
        </h4>
      ) : null}
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
  const [newChecklistItem, setNewChecklistItem] = useState('');
  const [savingReasons, setSavingReasons] = useState(false);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [savedReasonsDigest, setSavedReasonsDigest] = useState('');
  const [savedChecklistDigest, setSavedChecklistDigest] = useState('');

  const reasons = useMemo(
    () => parseStudentExitReasons(academy.studentExitReasons),
    [academy.studentExitReasons]
  );

  const checklist = useMemo(
    () => parseOffboardingChecklist(academy.studentOffboardingChecklist),
    [academy.studentOffboardingChecklist]
  );

  useEffect(() => {
    if (!academyId) return;
    setSavedReasonsDigest(serializeStudentExitReasons(academy.studentExitReasons));
    setSavedChecklistDigest(serializeOffboardingChecklist(academy.studentOffboardingChecklist));
  }, [academyId, academyDataVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasUnsavedReasons = useMemo(
    () => serializeStudentExitReasons(academy.studentExitReasons) !== savedReasonsDigest,
    [academy.studentExitReasons, savedReasonsDigest]
  );

  const hasUnsavedChecklist = useMemo(
    () => serializeOffboardingChecklist(academy.studentOffboardingChecklist) !== savedChecklistDigest,
    [academy.studentOffboardingChecklist, savedChecklistDigest]
  );

  const saveReasons = async (list) => {
    if (!academyId || !canEdit) return;
    setSavingReasons(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        student_exit_reasons: serializeStudentExitReasons(list),
      });
      setAcademy((a) => ({ ...a, studentExitReasons: list }));
      setSavedReasonsDigest(serializeStudentExitReasons(list));
      addToast({ type: 'success', message: 'Motivos de saída salvos.' });
    } catch (e) {
      console.error('save exit reasons:', e);
      addToast({ type: 'error', message: 'Não foi possível salvar os motivos de saída.' });
    } finally {
      setSavingReasons(false);
    }
  };

  const saveChecklist = async (list) => {
    if (!academyId || !canEdit) return;
    setSavingChecklist(true);
    try {
      await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
        student_offboarding_checklist: serializeOffboardingChecklist(list),
      });
      setAcademy((a) => ({ ...a, studentOffboardingChecklist: list }));
      setSavedChecklistDigest(serializeOffboardingChecklist(list));
      addToast({ type: 'success', message: 'Checklist de desligamento salvo.' });
    } catch (e) {
      console.error('save offboarding checklist:', e);
      addToast({ type: 'error', message: 'Não foi possível salvar o checklist.' });
    } finally {
      setSavingChecklist(false);
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

  const handleAddChecklistItem = () => {
    const label = String(newChecklistItem || '').trim();
    if (!label) return;
    const lower = label.toLowerCase();
    if (checklist.some((r) => r.toLowerCase() === lower)) {
      addToast({ type: 'warning', message: 'Esta tarefa já existe no checklist.' });
      return;
    }
    setAcademy((a) => ({
      ...a,
      studentOffboardingChecklist: [...parseOffboardingChecklist(a.studentOffboardingChecklist), label],
    }));
    setNewChecklistItem('');
  };

  const removeChecklistItem = (idx) => {
    const next = checklist.filter((_, i) => i !== idx);
    if (next.length === 0) {
      addToast({ type: 'warning', message: 'Mantenha pelo menos uma tarefa no checklist.' });
      return;
    }
    setAcademy((a) => ({ ...a, studentOffboardingChecklist: next }));
  };

  return (
    <section className="empresa-section animate-in" style={{ animationDelay: '0.05s' }}>
      <div className="card">
        <div className="mb-3">
          <h3 className="navi-section-heading">Alunos</h3>
          <p className="text-small" style={{ color: 'var(--text-secondary)', marginTop: 6 }}>
            Configure o que aparece ao desligar um aluno e quais tarefas são criadas automaticamente no módulo
            Tarefas.
          </p>
        </div>

        <EditableStringList
          title="Motivos de saída"
          hint="Opções do modal ao confirmar o desligamento."
          items={reasons}
          canEdit={canEdit}
          saving={savingReasons}
          hasUnsaved={hasUnsavedReasons}
          newValue={newReason}
          onNewValueChange={setNewReason}
          onAdd={handleAddReason}
          onRemove={removeReason}
          onSave={() => void saveReasons(reasons)}
          onResetDefaults={() =>
            setAcademy((a) => ({ ...a, studentExitReasons: [...DEFAULT_STUDENT_EXIT_REASONS] }))
          }
          placeholder="Novo motivo de saída"
          saveLabel="Salvar motivos"
          resetLabel="Restaurar motivos padrão"
        />

        <EditableStringList
          title="Checklist de desligamento"
          hint="Cada item vira uma tarefa vinculada ao aluno, com prazo na data de saída, ao confirmar o desligamento."
          items={checklist}
          canEdit={canEdit}
          saving={savingChecklist}
          hasUnsaved={hasUnsavedChecklist}
          newValue={newChecklistItem}
          onNewValueChange={setNewChecklistItem}
          onAdd={handleAddChecklistItem}
          onRemove={removeChecklistItem}
          onSave={() => void saveChecklist(checklist)}
          onResetDefaults={() =>
            setAcademy((a) => ({ ...a, studentOffboardingChecklist: [...DEFAULT_OFFBOARDING_CHECKLIST] }))
          }
          placeholder="Nova tarefa do checklist"
          saveLabel="Salvar checklist"
          resetLabel="Restaurar checklist padrão"
        />
      </div>
    </section>
  );
};

export default StudentsSection;
