import React from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAcademyTurmas } from '../../hooks/useAcademyTurmas.js';

export default function ClassesTurmasRedirectSection({ academyId }) {
  const { turmas, loading } = useAcademyTurmas(academyId);

  return (
    <div className="card" style={{ padding: 16 }}>
      <h4 className="navi-section-heading" style={{ margin: '0 0 8px', fontSize: '0.95rem' }}>
        Turmas
      </h4>
      <p className="text-small text-muted" style={{ margin: '0 0 12px', lineHeight: 1.45 }}>
        As opções do campo Turma em cadastros e perfis vêm do catálogo de turmas. Gerencie nomes,
        capacidade e status em{' '}
        <Link to="/empresa?tab=horarios" className="edit-link">
          Minha academia → Horários
        </Link>
        .
      </p>

      {loading ? (
        <p className="text-small text-muted" role="status">
          Carregando turmas…
        </p>
      ) : turmas.length ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {turmas.map((item, idx) => (
            <li
              key={`${item}-${idx}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderBottom: '1px solid var(--border-light)',
              }}
            >
              <GraduationCap size={14} aria-hidden style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: 14, lineHeight: 1.4 }}>{item}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-small text-muted" style={{ margin: 0 }}>
          Nenhuma turma cadastrada ainda.
        </p>
      )}
    </div>
  );
}
