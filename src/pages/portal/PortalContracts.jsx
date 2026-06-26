import React, { useEffect, useState } from 'react';
import { ExternalLink, FileSignature } from 'lucide-react';
import { usePortal } from './PortalLayout.jsx';
import { fetchPortalContracts } from '../../lib/portalApi';
import { friendlyError } from '../../lib/errorMessages';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';

const STATUS_LABELS = {
  sent: 'Aguardando assinatura',
  viewed: 'Visualizado — assine para concluir',
};

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR');
}

export default function PortalContracts() {
  const { activeStudentId } = usePortal();
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeStudentId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetchPortalContracts(activeStudentId);
        if (!cancelled) {
          setContracts(res.contracts || []);
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

  return (
    <div>
      <h1 style={{ margin: '0 0 16px', fontSize: '1.35rem' }}>Contratos</h1>
      {error ? <ErrorBanner message={error} /> : null}
      {loading ? <p className="portal-card__muted">Carregando…</p> : null}

      {!loading && !error ? (
        contracts.length === 0 ? (
          <div className="portal-card">
            <p className="portal-card__muted">Nenhum contrato pendente de assinatura.</p>
          </div>
        ) : (
          contracts.map((c) => (
            <div key={c.id} className="portal-card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <FileSignature size={22} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 className="portal-card__title" style={{ margin: 0 }}>
                    {c.name}
                  </h2>
                  <p className="portal-card__muted" style={{ margin: '6px 0 0' }}>
                    {STATUS_LABELS[c.display_status] || 'Pendente'}
                    {c.expires_at ? ` · válido até ${formatDate(c.expires_at)}` : ''}
                  </p>
                  {c.sign_url ? (
                    <a
                      href={c.sign_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="portal-btn portal-btn--primary"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        marginTop: 12,
                        textDecoration: 'none',
                      }}
                    >
                      Assinar contrato
                      <ExternalLink size={16} aria-hidden />
                    </a>
                  ) : (
                    <p className="portal-card__muted" style={{ marginTop: 12 }}>
                      Link de assinatura indisponível. Fale com a academia.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))
        )
      ) : null}
    </div>
  );
}
