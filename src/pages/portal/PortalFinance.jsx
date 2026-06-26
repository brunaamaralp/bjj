import React, { useEffect, useState } from 'react';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalFinance } from '../../lib/portalApi';
import { paymentStatusLabelPt } from '../../lib/paymentStatus';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';
import PortalWhatsAppCta from '../../components/portal/PortalWhatsAppCta.jsx';

function formatMonth(ym) {
  if (!ym || ym.length < 7) return ym || '—';
  try {
    const d = new Date(`${ym.slice(0, 7)}-02`);
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  } catch {
    return ym;
  }
}

export default function PortalFinance() {
  const { context, activeStudentId } = usePortal();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchPortalFinance(activeStudentId);
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

  const statusKey = data?.paymentStatus?.key || 'none';

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Financeiro</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="portal-card__muted">Carregando…</p> : null}

      {!loading && data ? (
        <>
          <div className="portal-card">
            <h2 className="portal-card__title">Mês atual</h2>
            <p className="portal-card__muted">{formatMonth(data.paymentStatus?.reference_month)}</p>
            <span className="portal-chip portal-chip--muted" style={{ marginTop: 8 }}>
              {paymentStatusLabelPt(statusKey)}
            </span>
          </div>

          <div className="portal-card">
            <h2 className="portal-card__title">Histórico</h2>
            {(data.payments || []).length === 0 ? (
              <p className="portal-card__muted">Nenhum pagamento registrado.</p>
            ) : (
              (data.payments || []).map((p) => (
                <div key={p.id} className="portal-list-item">
                  <div>
                    <div>{formatMonth(p.reference_month)}</div>
                    <div className="portal-card__muted">{paymentStatusLabelPt(p.display_status || p.status)}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <PortalWhatsAppCta phone={context?.academy?.phone} />
        </>
      ) : null}
    </div>
  );
}
