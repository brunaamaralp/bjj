import React, { useEffect, useRef } from 'react';
import EmptyState from '../shared/EmptyState.jsx';

export default function InboxLinkStudentPanel({
  contactName = '',
  leadSearch,
  setLeadSearch,
  studentCandidates = [],
  studentsLoading = false,
  fetchStudents,
  onConfirm,
  onClose,
  busy = false,
}) {
  const searchRef = useRef(null);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        document.getElementById('inbox-link-student-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        searchRef.current?.focus?.({ preventScroll: true });
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      if (raf2) cancelAnimationFrame(raf2);
    };
  }, []);

  const label = String(contactName || 'contato').trim() || 'contato';

  return (
    <div className="inbox-context-card inbox-link-student-panel" id="inbox-link-student-panel">
      <div className="navi-section-heading inbox-context-card__heading">Vincular a aluno</div>
      <p className="navi-subtitle navi-subtitle--spaced">
        Escolha o aluno correspondente a <strong>{label}</strong>. O contato sai do funil e fica vinculado a esta
        conversa.
      </p>
      <div className="inbox-context-search-row inbox-link-student-panel__search">
        <input
          ref={searchRef}
          className="input"
          value={leadSearch}
          onChange={(e) => setLeadSearch(e.target.value)}
          placeholder="Buscar por nome ou telefone"
          disabled={busy}
          autoComplete="off"
        />
        <button
          className="btn btn-outline inbox-btn--ctx"
          onClick={() => fetchStudents?.()}
          disabled={studentsLoading || busy}
          type="button"
        >
          Atualizar
        </button>
      </div>
      {studentsLoading ? <div className="text-small inbox-context-muted">Carregando alunos…</div> : null}
      {!studentsLoading && studentCandidates.length === 0 ? (
        <EmptyState variant="compact" tone="dashed" title="Nenhum aluno encontrado." role="status" />
      ) : null}
      {!studentsLoading && studentCandidates.length > 0 ? (
        <div className="inbox-context-list">
          {studentCandidates.map((s) => (
            <button
              key={s.id}
              className="btn btn-outline inbox-context-list-item"
              onClick={() => onConfirm?.(s.id)}
              disabled={busy}
              type="button"
            >
              <span className="inbox-context-list-item__main">
                <span className="inbox-context-list-item__title">{s.name || 'Sem nome'}</span>
                <span className="text-small inbox-context-muted">{s.phone || ''}</span>
              </span>
              {s.plan ? <span className="text-small inbox-context-muted">{s.plan}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
      <div className="inbox-context-btn-row inbox-context-btn-row--end inbox-context-footer-note">
        <button className="btn btn-outline inbox-btn--ctx" type="button" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
