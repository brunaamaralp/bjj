import React, { useEffect, useState } from 'react';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalAttendance } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';

function formatCheckin(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso || '—');
  return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function PortalAttendance() {
  const { activeStudentId } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchPortalAttendance(activeStudentId);
        if (!cancelled) {
          setData(res);
          setError('');
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
  }, [activeStudentId]);

  const stats = data?.stats || {};

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Presença</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="portal-card__muted">Carregando…</p> : null}

      {!loading && data ? (
        <>
          <div className="portal-stat-grid" style={{ marginBottom: 12 }}>
            <div className="portal-stat">
              <div className="portal-stat__value">{stats.thisMonth ?? 0}</div>
              <div className="portal-stat__label">Este mês</div>
            </div>
            <div className="portal-stat">
              <div className="portal-stat__value">{stats.lastMonth ?? 0}</div>
              <div className="portal-stat__label">Mês anterior</div>
            </div>
            <div className="portal-stat">
              <div className="portal-stat__value">{stats.monthlyRate || '0%'}</div>
              <div className="portal-stat__label">Frequência</div>
            </div>
            <div className="portal-stat">
              <div className="portal-stat__value">{stats.total ?? 0}</div>
              <div className="portal-stat__label">Total</div>
            </div>
          </div>

          <div className="portal-card">
            <h2 className="portal-card__title">Últimas presenças</h2>
            {(data.recent || []).length === 0 ? (
              <p className="portal-card__muted">Nenhum check-in registrado.</p>
            ) : (
              (data.recent || []).map((row) => (
                <div key={row.id} className="portal-list-item">
                  <span>{formatCheckin(row.checked_in_at)}</span>
                  {row.turma ? <span className="portal-card__muted">{row.turma}</span> : null}
                </div>
              ))
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
