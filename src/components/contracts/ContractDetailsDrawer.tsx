import React, { useMemo } from 'react';
import { X, ExternalLink, FileSignature } from 'lucide-react';
import { useContractDetail } from '../../features/contracts/queries.js';
import ContractStatusBadge, { SignerStatusBadge } from './ContractStatusBadge.js';
import {
  mapContractDisplayStatus,
  eventTypeLabel,
  autentiqueSignedDocumentUrl,
} from '../../features/contracts/status.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';

interface ContractDetailsDrawerProps {
  contractId: string | null;
  onClose: () => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

export default function ContractDetailsDrawer({ contractId, onClose }: ContractDetailsDrawerProps) {
  const { data: contract, isLoading, isError, error, refetch } = useContractDetail(contractId, Boolean(contractId));

  const displayStatus = useMemo(() => {
    if (!contract) return 'pending' as const;
    return mapContractDisplayStatus(
      contract.status,
      contract.signersSigned ?? 0,
      contract.signersTotal ?? contract.signers?.length ?? 0
    );
  }, [contract]);

  const signedCount = contract?.signers?.filter((s) => {
    const st = String(s.status || '').toLowerCase();
    return st === 'signed' || st === 'accepted';
  }).length ?? 0;

  const totalSigners = contract?.signers?.length ?? 0;
  const signedUrl = autentiqueSignedDocumentUrl(contract?.autentiqueId);
  const showSignedDoc = displayStatus === 'completed' && signedUrl;

  const timeline = useMemo(() => {
    const events = contract?.events || [];
    return [...events].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [contract?.events]);

  if (!contractId) return null;

  return (
    <>
      <div className="contracts-drawer-backdrop" role="presentation" onMouseDown={onClose} />
      <aside className="contracts-drawer-panel" aria-labelledby="contract-drawer-title">
        <div className="contracts-drawer-header">
          <h2 id="contract-drawer-title" className="contracts-drawer-heading">
            <FileSignature size={20} aria-hidden />
            Detalhes do contrato
          </h2>
          <button type="button" className="contracts-drawer-close" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <div className="contracts-drawer-body">
          {isLoading ? (
            <PageSkeleton variant="list" rows={4} />
          ) : isError ? (
            <ErrorBanner message={error instanceof Error ? error.message : 'Erro ao carregar contrato'} />
          ) : contract ? (
            <>
              <div className="contracts-drawer-section">
                <h3 className="contracts-drawer-name">{contract.name}</h3>
                <div className="contracts-drawer-meta">
                  <ContractStatusBadge status={displayStatus} />
                  <span className="text-small text-muted">
                    Criado em {formatDateTime(contract.createdAt)}
                  </span>
                </div>
                {contract.sandbox ? (
                  <span className="contracts-sandbox-tag">Sandbox (teste)</span>
                ) : null}
              </div>

              {showSignedDoc ? (
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary contracts-signed-link"
                >
                  <ExternalLink size={16} />
                  Ver documento assinado
                </a>
              ) : null}

              <div className="contracts-drawer-section">
                <h4 className="navi-section-heading contracts-subheading">Signatários ({signedCount}/{totalSigners})</h4>
                <ul className="contracts-signers-list">
                  {(contract.signers || []).map((s) => (
                    <li key={s.$id} className="contracts-signer-row">
                      <div>
                        <strong>{s.name || s.email || 'Signatário'}</strong>
                        {s.email ? <p className="text-small text-muted">{s.email}</p> : null}
                        {s.phone ? <p className="text-small text-muted">{s.phone}</p> : null}
                      </div>
                      <div className="contracts-signer-row-meta">
                        <SignerStatusBadge status={s.status} />
                        {s.signedAt ? (
                          <span className="text-small text-muted">Assinado {formatDateTime(s.signedAt)}</span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="contracts-drawer-section">
                <h4 className="navi-section-heading contracts-subheading">Histórico</h4>
                {timeline.length === 0 ? (
                  <p className="text-small text-muted">Nenhum evento registrado ainda.</p>
                ) : (
                  <ol className="contracts-timeline">
                    {timeline.map((ev) => (
                      <li key={ev.$id} className="contracts-timeline-item">
                        <span className="contracts-timeline-dot" aria-hidden />
                        <div className="contracts-timeline-content">
                          <strong>{eventTypeLabel(ev.eventType)}</strong>
                          <span className="text-small text-muted">{formatDateTime(ev.createdAt)}</span>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </>
          ) : null}
        </div>

        {isError ? (
          <div className="contracts-drawer-footer">
            <button type="button" className="btn-outline" onClick={() => refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
