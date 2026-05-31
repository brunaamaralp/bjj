import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { readAcademyTurmas } from '../../lib/academyTurmas.js';
import {
  STUDENT_SETTINGS_ITEMS,
  STUDENT_SETTINGS_SECTIONS,
  isStudentSettingsSection,
} from '../../lib/studentSettingsSections.js';
import AcademyTurmasSection from './AcademyTurmasSection.jsx';
import PublicEnrollmentSection from './PublicEnrollmentSection.jsx';
import StudentsSettingsHub from './settings/StudentsSettingsHub.jsx';
import FinanceSettingsDetailHeader from '../finance/settings/FinanceSettingsDetailHeader.jsx';
import '../finance/finance.css';

const SECTION_META = Object.fromEntries(STUDENT_SETTINGS_ITEMS.map((item) => [item.id, item]));

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
  footerNote,
}) {
  return (
    <div className="finance-settings-section-body">
      {hint ? (
        <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
          {hint}
        </p>
      ) : null}
      {footerNote ? (
        <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
          {footerNote}
        </p>
      ) : null}

      <ol className="students-settings-list">
        {items.map((item, idx) => (
          <li key={`${item}-${idx}`} className="students-settings-list__item">
            <span className="students-settings-list__text">
              <span className="students-settings-list__index">{idx + 1}.</span>
              {item}
            </span>
            {canEdit ? (
              <button
                type="button"
                className="btn-action-ghost"
                aria-label={`Remover item ${idx + 1}`}
                onClick={() => onRemove(idx)}
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
          <div className="flex gap-2 flex-wrap items-center">
            {hasUnsaved ? (
              <span className="funil-unsaved-pill" role="status">
                Alterações não salvas
              </span>
            ) : null}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const section = isStudentSettingsSection(searchParams.get('section'));
  const addToast = useUiStore((s) => s.addToast);
  const role = useUserRole(academy);
  const canEdit = role === 'owner' || role === 'admin';

  const [turmasCount, setTurmasCount] = useState(null);
  const [academySettingsRaw, setAcademySettingsRaw] = useState('');
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
    if (!academyId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setTurmasCount(readAcademyTurmas(doc.settings).length);
        setAcademySettingsRaw(doc.settings || '');
      } catch {
        if (!cancelled) setTurmasCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, academyDataVersion]);

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

  const goHub = () => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'alunos');
        next.delete('section');
        return next;
      },
      { replace: false }
    );
  };

  const goSection = (id) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('tab', 'alunos');
        next.set('section', id);
        return next;
      },
      { replace: false }
    );
  };

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

  const meta = section ? SECTION_META[section] : null;
  const automationsFootnote = (
    <>
      Para tarefas automáticas ao desligar ou matricular, configure em{' '}
      <Link to="/automacoes?tab=processos" className="edit-link">
        Automações → Processos
      </Link>
      .
    </>
  );

  return (
    <section className={`empresa-section animate-in students-settings${section ? ' students-settings--detail' : ''}`}>
      {!section ? (
        <StudentsSettingsHub
          academy={{ ...academy, settings: academySettingsRaw }}
          turmasCount={turmasCount}
          onSelectSection={goSection}
        />
      ) : (
        <>
          <FinanceSettingsDetailHeader
            title={meta?.label || 'Alunos'}
            subtitle={meta?.hint}
            onBack={goHub}
            backLabel="Alunos"
          />

          {section === STUDENT_SETTINGS_SECTIONS.DESLIGAMENTO ? (
            <div className="card" style={{ padding: 16 }}>
              <EditableStringList
                hint="Motivos exibidos ao encerrar matrícula de um aluno."
                footerNote={automationsFootnote}
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
                saveLabel="Salvar"
                resetLabel="Restaurar padrões"
              />
            </div>
          ) : null}

          {section === STUDENT_SETTINGS_SECTIONS.TRANCAMENTO ? (
            <div className="card" style={{ padding: 16 }}>
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
                saveLabel="Salvar"
                resetLabel="Restaurar padrões"
              />
            </div>
          ) : null}

          {section === STUDENT_SETTINGS_SECTIONS.MATRICULA ? (
            <PublicEnrollmentSection
              academyId={academyId}
              academy={academy}
              setAcademy={setAcademy}
              canEdit={canEdit}
              embedded
            />
          ) : null}

          {section === STUDENT_SETTINGS_SECTIONS.TURMAS ? (
            <AcademyTurmasSection academyId={academyId} academyDataVersion={academyDataVersion} embedded />
          ) : null}
        </>
      )}

      <style
        dangerouslySetInnerHTML={{
          __html: `
        .students-settings-list {
          list-style: none;
          padding: 0;
          margin: 0 0 12px;
        }
        .students-settings-list__item {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          border-bottom: 1px solid var(--border-light);
        }
        .students-settings-list__text {
          font-size: 14px;
          line-height: 1.4;
          flex: 1;
        }
        .students-settings-list__index {
          color: var(--text-muted);
          margin-right: 6px;
        }
      `,
        }}
      />
    </section>
  );
};

export default StudentsSection;
