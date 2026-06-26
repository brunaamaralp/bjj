import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalFinance, fetchPortalGuides } from '../../lib/portalApi';
import { paymentStatusLabelPt } from '../../lib/paymentStatus';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';

function paymentChipClass(key) {
  if (key === 'paid' || key === 'covered') return 'portal-chip portal-chip--success';
  if (key === 'pending' || key === 'awaiting' || key === 'partial') return 'portal-chip portal-chip--danger';
  return 'portal-chip portal-chip--muted';
}

export default function PortalHome() {
  const { context, activeStudentId } = usePortal();
  const student = context?.students?.find((s) => s.id === activeStudentId);
  const [finance, setFinance] = useState(null);
  const [guides, setGuides] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    (async () => {
      try {
        const [fin, g] = await Promise.all([
          fetchPortalFinance(activeStudentId),
          fetchPortalGuides({ studentId: activeStudentId, academyId: context?.academy_id }),
        ]);
        if (cancelled) return;
        setFinance(fin);
        setGuides((g.guides || []).slice(0, 2));
        setError('');
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'load'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStudentId, context?.academy_id]);

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Olá, {student?.name?.split(' ')[0] || 'aluno'}</h1>
      {error ? <ErrorBanner message={error} /> : null}

      <div className="portal-card">
        <h2 className="portal-card__title">Resumo</h2>
        <p className="portal-card__muted" style={{ marginBottom: 8 }}>
          {student?.turma ? `Turma: ${student.turma}` : 'Turma não informada'}
          {student?.belt ? ` · ${student.belt}` : ''}
        </p>
        {finance?.paymentStatus ? (
          <span className={paymentChipClass(finance.paymentStatus.key)}>
            {paymentStatusLabelPt(finance.paymentStatus.key)}
          </span>
        ) : null}
      </div>

      {guides.length ? (
        <div className="portal-card">
          <h2 className="portal-card__title">Orientações em destaque</h2>
          {guides.map((g) => (
            <Link
              key={g.id}
              to={`/portal/orientacoes/${encodeURIComponent(g.slug)}`}
              className="portal-list-item portal-guide-card"
            >
              <span>{g.title}</span>
              <span className="portal-card__muted">→</span>
            </Link>
          ))}
          <Link to="/portal/orientacoes" className="portal-card__muted" style={{ fontSize: '0.85rem' }}>
            Ver todas
          </Link>
        </div>
      ) : null}
    </div>
  );
}
