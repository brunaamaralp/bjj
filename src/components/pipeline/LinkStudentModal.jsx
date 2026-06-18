import React, { useMemo, useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import EmptyState from '../shared/EmptyState.jsx';
import { filterStudentCandidates } from '../../lib/studentSearchFilter.js';

export default function LinkStudentModal({
  open,
  lead,
  students = [],
  studentsLoading = false,
  saving = false,
  onClose,
  onConfirm,
}) {
  const [search, setSearch] = useState('');

  const candidates = useMemo(
    () => filterStudentCandidates(students, { query: search, phoneHint: lead?.phone, limit: 20 }),
    [students, search, lead?.phone]
  );

  const handleClose = () => {
    if (saving) return;
    setSearch('');
    onClose?.();
  };

  if (!open) return null;

  const leadLabel = String(lead?.name || lead?.phone || 'contato').trim() || 'contato';

  return (
    <ModalShell open={open} title="Vincular a aluno" onClose={handleClose} maxWidth={440}>
      <p className="navi-subtitle navi-subtitle--spaced">
        O contato <strong>{leadLabel}</strong> não é lead — escolha o aluno correspondente. O card será removido do funil.
      </p>
      <div className="pipeline-link-student-search">
        <input
          className="form-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          disabled={saving}
          autoFocus
          aria-label="Buscar aluno por nome ou telefone"
        />
      </div>
      {studentsLoading ? (
        <p className="text-small" style={{ color: 'var(--text-muted)' }}>
          Carregando alunos…
        </p>
      ) : null}
      {!studentsLoading && candidates.length === 0 ? (
        <EmptyState variant="compact" tone="dashed" title="Nenhum aluno encontrado." role="status" />
      ) : null}
      {!studentsLoading && candidates.length > 0 ? (
        <div className="pipeline-link-student-list">
          {candidates.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-outline pipeline-link-student-item"
              disabled={saving}
              onClick={() => onConfirm?.(s.id)}
            >
              <span className="pipeline-link-student-item__main">
                <span className="pipeline-link-student-item__name">{s.name || 'Sem nome'}</span>
                <span className="text-small" style={{ color: 'var(--text-muted)' }}>
                  {s.phone || ''}
                </span>
              </span>
              {s.plan ? (
                <span className="text-small" style={{ color: 'var(--text-muted)' }}>
                  {s.plan}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="pipeline-link-student-footer">
        <button type="button" className="btn-outline" onClick={handleClose} disabled={saving}>
          Cancelar
        </button>
      </div>
    </ModalShell>
  );
}
