import React, { useEffect, useMemo } from 'react';
import { X, ExternalLink, FileSignature, Copy, RefreshCw } from 'lucide-react';
import { useContractDetail, useCancelContract } from '../../features/contracts/queries.js';
import ContractStatusBadge, { SignerStatusBadge } from './ContractStatusBadge.js';
import {
  mapContractDisplayStatusForRecord,
  eventTypeLabel,
  autentiqueSignedDocumentUrl,
} from '../../features/contracts/status.js';
import { resolveSignerShortLink } from '../../../lib/contracts/signersLinks.js';
import { useUiStore } from '../../store/useUiStore.js';
import PageSkeleton from '../shared/PageSkeleton.jsx';
import ErrorBanner from '../shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages.js';

interface ContractDetailsDrawerProps {
  contractId: string | null;
  onClose: () => void;
  onResend?: () => void;
  onCancelAndNew?: () => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('pt-BR');
}

function isSignerPending(status: string): boolean {
  const s = String(status || '').toLowerCase();
  return s !== 'signed' && s !== 'accepted' && s !== 'rejected' && s !== 'removed';
}

export default function ContractDetailsDrawer({
  contractId,
  onClose,
  onResend,
  onCancelAndNew,
}: ContractDetailsDrawerProps) {
  const addToast = useUiStore((s) => s.addToast);
  const cancelMutation = useCancelContract();
  const { data: contract, isLoading, isError, error, refetch } = useContractDetail(contractId, Boolean(contractId));

  useEffect(() => {
    if (!contractId) return undefined;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [contractId, onClose]);

  const displayStatus = useMemo(() => {
    if (!contract) return 'sent' as const;
    return mapContractDisplayStatusForRecord(contract);
  }, [contract]);

  const signedCount =
    contract?.signers?.filter((s) => {
      const st = String(s.status || '').toLowerCase();
      return st === 'signed' || st === 'accepted';
    }).length ?? 0;

  const totalSigners = contract?.signers?.length ?? 0;
  const signedUrl = autentiqueSignedDocumentUrl(contract?.autentiqueId);
  const showSignedDoc = displayStatus === 'signed' && signedUrl;
  const showCopyLinks = displayStatus === 'sent' || displayStatus === 'viewed';
  const showExpiredActions = displayStatus === 'expired';
  const signerLinks = contract?.signersLinks || [];

  const timeline = useMemo(() => {
    const events = contract?.events || [];
    return [...events].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [contract?.events]);

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      addToast({ type: 'success', message: 'Link copiado!' });
    } catch {
      addToast({ type: 'error', message: 'Não foi possível copiar o link' });
    }
  };

  const handleCancel = async () => {
    if (!contract?.$id) return;
    try {
      await cancelMutation.mutateAsync(contract.$id);
      addToast({ type: 'success', message: 'Contrato cancelado.' });
      refetch();
      onCancelAndNew?.();
    } catch (e) {
      addToast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Falha ao cancelar',
      });
    }
  };

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
            <ErrorBanner
              message={friendlyError(error, 'load')}
              onRetry={() => void refetch()}
            />
          ) : contract ? (
            <>
              <div className="contracts-drawer-section">
                <h3 className="contracts-drawer-name">{contract.name}</h3>
                <div className="contracts-drawer-meta">
                  <ContractStatusBadge status={displayStatus} />
                  <span className="text-small text-muted">Criado em {formatDateTime(contract.createdAt)}</span>
                </div>
                {contract.expiresAt ? (
                  <p className="text-small text-muted contracts-drawer-deadline">
                    Prazo para assinatura: {formatDateTime(contract.expiresAt)}
                  </p>
                ) : null}
                {contract.sandbox ? <span className="contracts-sandbox-tag">Sandbox (teste)</span> : null}
                {contract.metaStatus === 'signed_after_offboarding' ? (
                  <p className="text-small contracts-signed-after-offboarding">
                    Assinado após desligamento do aluno — revise o vínculo na academia.
                  </p>
                ) : null}
              </div>

              {showExpiredActions ? (
                <div className="contracts-drawer-expired-actions card">
                  <p className="text-small" style={{ margin: '0 0 10px' }}>
                    O prazo para assinatura expirou. Reenvie um novo contrato ou cancele este e gere outro.
                  </p>
                  <div className="contracts-drawer-expired-btns">
                    <button type="button" className="btn-primary" onClick={() => onResend?.()}>
                      <RefreshCw size={14} />
                      Reenviar
                    </button>
                    <button
                      type="button"
                      className="btn-outline"
                      onClick={() => void handleCancel()}
                      disabled={cancelMutation.isPending}
                    >
                      Cancelar e gerar novo
                    </button>
                  </div>
                </div>
              ) : null}

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
                <h4 className="navi-section-heading contracts-subheading">
                  Signatários ({signedCount}/{totalSigners})
                </h4>
                <ul className="contracts-signers-list">
                  {(contract.signers || []).map((s) => {
                    const pending = isSignerPending(s.status);
                    const shortLink = resolveSignerShortLink(s, signerLinks);
                    return (
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
                          {showCopyLinks && pending && shortLink ? (
                            <button
                              type="button"
                              className="btn-outline contracts-copy-link-btn"
                              onClick={() => void copyLink(shortLink)}
                            >
                              <Copy size={14} />
                              Copiar link
                            </button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
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
