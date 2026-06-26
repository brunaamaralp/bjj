import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalGuides } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';
import PortalGuideDetail from '../../components/portal/PortalGuideDetail.jsx';

export default function PortalGuides() {
  const { slug } = useParams();
  const { context, activeStudentId } = usePortal();
  const [guides, setGuides] = useState([]);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        if (slug) {
          const res = await fetchPortalGuides({
            studentId: activeStudentId,
            academyId: context?.academy_id,
            slug,
          });
          if (!cancelled) {
            setDetail(res.guide || null);
            setGuides([]);
            setError('');
          }
        } else {
          const res = await fetchPortalGuides({
            studentId: activeStudentId,
            academyId: context?.academy_id,
          });
          if (!cancelled) {
            setGuides(res.guides || []);
            setDetail(null);
            setError('');
          }
        }
      } catch (e) {
        if (!cancelled) setError(friendlyError(e, 'load'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeStudentId, context?.academy_id, slug]);

  if (slug) {
    if (loading) return <p className="portal-card__muted">Carregando…</p>;
    if (error) return <ErrorBanner message={error} />;
    return <PortalGuideDetail guide={detail} />;
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Orientações</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="portal-card__muted">Carregando…</p> : null}

      {!loading && guides.length === 0 ? (
        <div className="portal-card">
          <p className="portal-card__muted">Nenhuma orientação publicada ainda.</p>
        </div>
      ) : null}

      {!loading
        ? guides.map((g) => (
            <Link
              key={g.id}
              to={`/portal/orientacoes/${encodeURIComponent(g.slug)}`}
              className="portal-card portal-guide-card"
            >
              <h2 className="portal-card__title">{g.title}</h2>
              {g.summary ? <p className="portal-card__muted">{g.summary}</p> : null}
            </Link>
          ))
        : null}
    </div>
  );
}
