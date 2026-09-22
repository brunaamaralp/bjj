import React, { useEffect, useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import FieldError from '../shared/FieldError.jsx';
import SearchableSelect from '../shared/SearchableSelect.jsx';
import { useToast } from '../../hooks/useToast';
import { addLeadEvent } from '../../lib/leadEvents.js';
import { buildQuickNotePersonOptions } from '../../lib/quickNotePersonOptions.js';
import { useLeadStore } from '../../store/useLeadStore';
import { useStudentStore } from '../../store/useStudentStore';

const NOTE_MAX = 1000;

export default function QuickNoteModal({ open, onClose, academyId }) {
  const toast = useToast();
  const leads = useLeadStore((s) => s.leads);
  const leadsReady = useLeadStore((s) => s.leadsReady);
  const fetchLeads = useLeadStore((s) => s.fetchLeads);
  const updateLead = useLeadStore((s) => s.updateLead);
  const userId = useLeadStore((s) => s.userId);
  const academyList = useLeadStore((s) => s.academyList);

  const students = useStudentStore((s) => s.students);
  const studentsReady = useStudentStore((s) => s.studentsReady);
  const fetchStudents = useStudentStore((s) => s.fetchStudents);
  const updateStudent = useStudentStore((s) => s.updateStudent);

  const [personId, setPersonId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [personError, setPersonError] = useState('');
  const [noteError, setNoteError] = useState('');

  const options = useMemo(() => buildQuickNotePersonOptions(leads, students), [leads, students]);

  const permCtx = useMemo(() => {
    const acad = (academyList || []).find((a) => a.id === academyId) || {};
    return { ownerId: acad.ownerId, teamId: acad.teamId, userId: userId || '' };
  }, [academyList, academyId, userId]);

  useEffect(() => {
    if (!open || !academyId) return;
    if (!leadsReady) void fetchLeads({ reset: true });
    if (!studentsReady) void fetchStudents({ reset: true });
  }, [open, academyId, leadsReady, studentsReady, fetchLeads, fetchStudents]);

  useEffect(() => {
    if (!open) {
      setPersonId('');
      setNote('');
      setBusy(false);
      setPersonError('');
      setNoteError('');
    }
  }, [open]);

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (busy) return;

    const trimmed = note.trim().slice(0, NOTE_MAX);
    let ok = true;
    if (!personId) {
      setPersonError('Selecione um aluno ou lead.');
      ok = false;
    } else {
      setPersonError('');
    }
    if (!trimmed) {
      setNoteError('Informe a nota.');
      ok = false;
    } else {
      setNoteError('');
    }
    if (!ok) return;

    const selected = options.find((o) => o.value === personId);
    const kind = selected?.kind || 'lead';

    setBusy(true);
    try {
      await addLeadEvent({
        academyId,
        leadId: personId,
        type: 'note',
        text: trimmed,
        createdBy: userId || 'user',
        permissionContext: permCtx,
      });
      const stamp = { lastNoteAt: new Date().toISOString() };
      try {
        if (kind === 'student') {
          await updateStudent(personId, stamp);
        } else {
          await updateLead(personId, stamp);
        }
      } catch {
        /* nota já gravada; lastNoteAt é best-effort */
      }
      toast.success('Nota adicionada.');
      onClose?.();
    } catch (err) {
      toast.error(err, 'save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Nota rápida"
      maxWidth={480}
      dialogClassName="navi-quick-note-modal"
      footer={
        <>
          <button type="button" className="btn-outline" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            form="quick-note-form"
            className="btn-primary"
            disabled={busy || !personId || !note.trim()}
          >
            {busy ? 'Salvando…' : 'Salvar'}
          </button>
        </>
      }
    >
      <form id="quick-note-form" onSubmit={(e) => void handleSubmit(e)}>
        <div className="form-group">
          <label htmlFor="quick-note-person">Pessoa</label>
          <SearchableSelect
            id="quick-note-person"
            value={personId}
            options={options}
            placeholder="Buscar aluno ou lead…"
            emptyMessage="Nenhuma pessoa encontrada."
            aria-label="Selecionar aluno ou lead"
            aria-invalid={personError ? true : undefined}
            aria-describedby={personError ? 'quick-note-person-error' : undefined}
            onChange={(value) => {
              setPersonId(value);
              if (value) setPersonError('');
            }}
            disabled={busy}
          />
          <FieldError id="quick-note-person-error">{personError}</FieldError>
        </div>
        <div className="form-group">
          <label htmlFor="quick-note-text">Nota</label>
          <textarea
            id="quick-note-text"
            className="form-input"
            value={note}
            maxLength={NOTE_MAX}
            rows={5}
            placeholder="Escreva a nota…"
            disabled={busy}
            aria-invalid={noteError ? true : undefined}
            aria-describedby={noteError ? 'quick-note-text-error' : undefined}
            onChange={(e) => {
              setNote(e.target.value);
              if (e.target.value.trim()) setNoteError('');
            }}
          />
          <FieldError id="quick-note-text-error">{noteError}</FieldError>
        </div>
      </form>
    </ModalShell>
  );
}
