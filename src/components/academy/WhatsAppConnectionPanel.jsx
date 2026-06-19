import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { Check, Copy, Smartphone } from 'lucide-react';
import { useZapsterWhatsAppConnection } from '../../hooks/useZapsterWhatsAppConnection';
import { useLeadStore } from '../../store/useLeadStore';
import { useUiStore } from '../../store/useUiStore';
import { useToast } from '../../hooks/useToast';
import { useTerms } from '../../lib/terminology.js';
import { formatWaPhoneDisplay } from '../../../lib/zapsterInstancePhone.js';
import {
  formatWaAgentStatus,
  formatWaLastChecked,
  waAgentStatusVisual,
} from '../../lib/waAgentStatusDisplay.js';
import { AGENTE_IA_SETUP_PATH, buildAgentIaSetupPath } from '../../lib/agentIaRoutes.js';
import ConfirmDialog from '../shared/ConfirmDialog.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import WhatsAppSetupStepper from './WhatsAppSetupStepper.jsx';
import { buildWaAgentJourneyProgress, isWaSetupStepDone } from '../../lib/waSetupProgress.js';
import '../academy/agent-ia.css';

export default function WhatsAppConnectionPanel({ academyId, isOwner }) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const toast = useToast();

  const zap = useZapsterWhatsAppConnection(academyId, {
    watchAcademyStatus: true,
    onRegisterWebhooksResult: ({ ok }) => {
      if (ok) {
        addToast({ type: 'success', message: 'WhatsApp reativado com sucesso.' });
        return;
      }
      addToast({ type: 'error', message: 'Erro ao reativar WhatsApp — tente reconectar.' });
    },
  });

  const [waConfirm, setWaConfirm] = useState(null);
  const [waQrBlobUrl, setWaQrBlobUrl] = useState(null);
  const waQrBlobUrlRef = useRef(null);
  const [waLastCheckedAt, setWaLastCheckedAt] = useState('');
  const waLoadingPrevRef = useRef(false);
  const setupAiDone = useLeadStore((s) =>
    Boolean(s.onboardingChecklist?.find((x) => x.id === 'setup_ai')?.done)
  );

  const shouldLoadWaQr =
    zap.waQrShown &&
    !zap.waConnected &&
    !!zap.waInfo?.instance_id &&
    !zap.waTokenMissing &&
    !zap.waQrError;

  useEffect(() => {
    if (!shouldLoadWaQr) {
      if (waQrBlobUrlRef.current) {
        URL.revokeObjectURL(waQrBlobUrlRef.current);
        waQrBlobUrlRef.current = null;
      }
      setWaQrBlobUrl(null);
      return;
    }
    let cancelled = false;
    const instanceId = String(zap.waInfo.instance_id);
    (async () => {
      const prev = waQrBlobUrlRef.current;
      if (prev) {
        URL.revokeObjectURL(prev);
        waQrBlobUrlRef.current = null;
      }
      setWaQrBlobUrl(null);
      const url = await zap.fetchQrCode(instanceId);
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      if (!url) {
        zap.onQrImageError();
        return;
      }
      waQrBlobUrlRef.current = url;
      setWaQrBlobUrl(url);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- QR keyed on instance_id/tick + stable zap methods
  }, [
    shouldLoadWaQr,
    zap.waInfo?.instance_id,
    zap.waQrTick,
    zap.fetchQrCode,
    zap.onQrImageError,
  ]);

  useEffect(() => {
    if (!academyId) return;
    if (!zap.waConnected) return;
    const done = useLeadStore.getState().onboardingChecklist?.find((x) => x.id === 'connect_whatsapp')?.done;
    if (done) return;
    void useLeadStore.getState().completeOnboardingStepIds(['connect_whatsapp']);
  }, [zap.waConnected, academyId]);

  useEffect(() => {
    if (waLoadingPrevRef.current && !zap.waLoading && academyId) {
      setWaLastCheckedAt(new Date().toISOString());
    }
    waLoadingPrevRef.current = zap.waLoading;
  }, [zap.waLoading, academyId]);

  useEffect(() => {
    if (!waConfirm) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setWaConfirm(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waConfirm]);

  const handleWaConfirmAction = () => {
    if (!waConfirm) return;
    const { variant } = waConfirm;
    flushSync(() => {
      setWaConfirm(null);
    });
    if (variant === 'disconnect') void zap.disconnectWaInstance();
    if (variant === 'powerOff') void zap.powerOffInstance();
    if (variant === 'restart') void zap.restartInstance();
  };

  const waStatusVisual = useMemo(() => waAgentStatusVisual(zap.waStatus), [zap.waStatus]);
  const WaStatusIcon = waStatusVisual.Icon;
  const cardConnected = zap.waConnected;
  const waDone = isWaSetupStepDone({
    waConnected: zap.waConnected,
    waStatus: zap.waStatus,
    instanceId: zap.waInfo?.instance_id,
  });
  const setupProgress = useMemo(
    () =>
      buildWaAgentJourneyProgress({
        waConnected: zap.waConnected,
        waStatus: zap.waStatus,
        instanceId: zap.waInfo?.instance_id,
        promptConfigurado: setupAiDone,
        iaAtiva: false,
      }),
    [zap.waConnected, zap.waStatus, zap.waInfo?.instance_id, setupAiDone]
  );
  const showAgentSetupHandoff = isOwner && zap.waConnected && !setupAiDone;
  const agentSetupPath = buildAgentIaSetupPath({ fromIntegracoes: true });

  const handleCopyIntegracoesLink = useCallback(async () => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/integracoes?tab=whatsapp`
        : '/integracoes?tab=whatsapp';
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copiado. Envie ao dono da academia.');
    } catch {
      toast.error('Não foi possível copiar o link.');
    }
  }, [toast]);

  const renderWaRefreshButton = (extraStyle = {}) => (
    <button
      type="button"
      className="btn btn-outline"
      style={{ padding: '8px 14px', ...extraStyle }}
      onClick={() => void zap.fetchWaInfo()}
      disabled={zap.waLoading || zap.waTokenMissing}
    >
      Atualizar status
    </button>
  );

  const renderWaBanners = () => (
    <>
      {zap.waTokenMissing ? (
        <StatusBanner
          variant="error"
          message="Integração não finalizada — fale com o suporte para concluir a conexão com o WhatsApp."
        />
      ) : null}
      {zap.waPersistFailed && isOwner ? (
        <StatusBanner
          variant="warning"
          message="A conexão foi criada, mas não foi possível salvar no sistema."
          action={{
            label: 'Corrigir automaticamente',
            onClick: () => void zap.recoverZapsterInstance(),
          }}
        />
      ) : null}
      {zap.connectionError && !zap.waTokenMissing ? (
        <StatusBanner
          variant="error"
          message={zap.connectionError}
          onRetry={() => void zap.fetchWaInfo()}
          retryLabel="Tentar novamente"
        />
      ) : null}
    </>
  );

  const renderWaConnectedSummary = () => {
    const waPhoneDisplay = formatWaPhoneDisplay(zap.waInfo?.phone);
    return (
      <div className="agent-ia-connected-summary">
        <div className="agent-ia-connected-summary__row">
          <span className="agent-ia-connected-summary__status">
            <Check size={16} strokeWidth={2.5} aria-hidden />
            WhatsApp conectado
          </span>
          {renderWaRefreshButton()}
        </div>
        {waPhoneDisplay ? (
          <p className="agent-ia-connected-summary__meta">
            Número conectado: <strong>{waPhoneDisplay}</strong>
          </p>
        ) : null}
        {waLastCheckedAt ? (
          <p className="agent-ia-connected-summary__meta">
            Status verificado em {formatWaLastChecked(waLastCheckedAt)}.
            {zap.waLoading ? ' Atualizando…' : null}
          </p>
        ) : null}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignSelf: 'flex-start' }}>
          {isOwner ? (
            <Link
              to={agentSetupPath}
              state={{ fromIntegracoes: true }}
              className="btn btn-primary"
              style={{ padding: '8px 14px' }}
            >
              Configurar assistente
            </Link>
          ) : null}
          <Link to="/inbox" className="btn btn-outline" style={{ padding: '8px 14px' }}>
            Ver conversas
          </Link>
        </div>
      </div>
    );
  };

  const renderOwnerMaintenance = () => {
    if (!isOwner) return null;
    return (
      <details className="agent-ia-maintenance">
        <summary className="agent-ia-maintenance__summary">Precisa de ajuda com a conexão? →</summary>
        <div className="agent-ia-maintenance__body">
          <div className="agent-ia-maintenance__group">
            <p className="agent-ia-maintenance__group-title">Corrigir problemas</p>
            <div className="agent-ia-maintenance__actions">
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 10px' }}
                onClick={() => void zap.recoverZapsterInstance()}
                disabled={zap.waLoading || zap.waTokenMissing}
              >
                Corrigir conexão automaticamente
              </button>
              <button
                type="button"
                className="btn btn-outline"
                style={{ padding: '6px 10px' }}
                onClick={() => void zap.reconcileWhatsAppHistory()}
                disabled={zap.waLoading || zap.waSyncing || zap.waTokenMissing}
              >
                {zap.waSyncing ? 'Buscando…' : 'Buscar mensagens recentes'}
              </button>
            </div>
          </div>
          {!!zap.waInfo?.instance_id && (
            <div className="agent-ia-maintenance__group">
              <p className="agent-ia-maintenance__group-title">Ações avançadas</p>
              <div className="agent-ia-maintenance__actions">
                {zap.waInfo?.status === 'offline' && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ padding: '6px 10px' }}
                    onClick={() => void zap.powerOnInstance()}
                    disabled={zap.waLoading || zap.waTokenMissing}
                  >
                    Conectar WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 10px' }}
                  onClick={() =>
                    setWaConfirm({
                      variant: 'powerOff',
                      title: 'Pausar conexão?',
                      description: 'O WhatsApp pode ficar offline até você retomar a conexão.',
                      confirmLabel: 'Pausar conexão',
                    })
                  }
                  disabled={zap.waLoading || zap.waTokenMissing}
                >
                  Pausar conexão
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ padding: '6px 10px' }}
                  onClick={() =>
                    setWaConfirm({
                      variant: 'restart',
                      title: 'Reiniciar a conexão?',
                      description: 'Pode levar alguns instantes. Use se o atendimento travou.',
                      confirmLabel: 'Reiniciar conexão',
                    })
                  }
                  disabled={zap.waLoading || zap.waTokenMissing}
                >
                  Reiniciar conexão
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: '6px 10px' }}
                  onClick={() =>
                    setWaConfirm({
                      variant: 'disconnect',
                      title: 'Remover conexão WhatsApp?',
                      description: 'O assistente para de responder até você conectar novamente.',
                      confirmLabel: 'Remover conexão',
                    })
                  }
                  disabled={zap.waLoading || zap.waTokenMissing}
                >
                  Remover conexão WhatsApp
                </button>
              </div>
            </div>
          )}
        </div>
      </details>
    );
  };

  const cardClass = [
    'agent-ia-card',
    cardConnected ? 'agent-ia-card--wa-connected' : '',
    'agent-ia-card--focus',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <div className={cardClass}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: cardConnected ? 12 : 16,
            flexWrap: 'wrap',
          }}
        >
          <Smartphone
            size={22}
            strokeWidth={1.75}
            color={cardConnected ? '#25D366' : 'var(--text-secondary)'}
            aria-hidden
          />
          <span className="navi-section-heading" style={{ fontSize: '1.05rem', margin: 0, flex: 1 }}>
            Conexão WhatsApp
          </span>
          {cardConnected ? (
            <span className="text-small" style={{ color: '#25D366', fontWeight: 700 }}>
              ● Conectado
            </span>
          ) : waDone ? (
            <span className="text-small" style={{ color: 'var(--accent)', fontWeight: 700 }}>
              ● Pausado
            </span>
          ) : null}
        </div>

        {isOwner ? (
          <WhatsAppSetupStepper
            waDone={setupProgress.waDone}
            configDone={setupProgress.configDone}
            activeDone={setupProgress.activeDone}
            canEditAgent
            currentStep={setupProgress.currentStep > 0 ? setupProgress.currentStep : undefined}
          />
        ) : null}

        <div className="agent-ia-section-banners">{renderWaBanners()}</div>

        {showAgentSetupHandoff ? (
          <StatusBanner variant="success" className="mb-3">
            <span>
              WhatsApp conectado! Próximo passo: configure o assistente para atender automaticamente.{' '}
              <Link to={agentSetupPath} state={{ fromIntegracoes: true }} className="edit-link">
                Configurar assistente
              </Link>
            </span>
          </StatusBanner>
        ) : null}

        {cardConnected ? (
          renderWaConnectedSummary()
        ) : (
          <>
            {!isOwner && (
              <div
                className="agent-ia-member-wa-hint"
                role="note"
                style={{
                  margin: '0 0 16px',
                  padding: '10px 12px',
                  borderRadius: 8,
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  fontSize: '0.85rem',
                  lineHeight: 1.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <p style={{ margin: '0 0 10px' }}>Peça ao dono da academia para conectar o WhatsApp.</p>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => void handleCopyIntegracoesLink()}
                >
                  <Copy size={14} aria-hidden />
                  Copiar link desta página
                </button>
              </div>
            )}

            {!zap.waInfo?.instance_id && (
              <div style={{ textAlign: 'center', padding: '8px 0 16px', maxWidth: 420, margin: '0 auto' }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600, color: 'var(--text)' }}>Primeiro passo</p>
                <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.55 }}>
                  {isOwner
                    ? `Conecte o WhatsApp desta ${terms.workspaceNoun}. Na sequência você poderá exibir o código QR para escanear no celular.`
                    : 'Somente o dono da academia pode iniciar a conexão nesta página.'}
                </p>
                {isOwner ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void zap.createWaInstance()}
                    disabled={zap.waLoading || zap.waTokenMissing || zap.isCreating}
                  >
                    {zap.waLoading || zap.isCreating ? 'Aguarde…' : 'Conectar WhatsApp'}
                  </button>
                ) : null}
              </div>
            )}

            {!!zap.waInfo?.instance_id && !zap.waTokenMissing && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 16,
                  width: '100%',
                  maxWidth: 440,
                  margin: '0 auto',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: '1px solid var(--border)',
                    background: waStatusVisual.bg,
                    borderLeft: `4px solid ${waStatusVisual.accent}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <WaStatusIcon size={20} color={waStatusVisual.accent} strokeWidth={2} aria-hidden />
                    <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
                      Status da conexão
                    </span>
                  </div>
                  <span className="text-small" style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {formatWaAgentStatus(zap.waStatus)}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center' }}>{renderWaRefreshButton()}</div>

                {!zap.waQrShown && (
                  <div
                    style={{
                      textAlign: 'center',
                      padding: '18px 16px',
                      borderRadius: 12,
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                    }}
                  >
                    <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: '0.98rem', color: 'var(--text)' }}>
                      Conectar pelo celular (QR Code)
                    </p>
                    <p className="text-small" style={{ color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.55 }}>
                      {isOwner ? (
                        <>
                          {String(zap.waStatus || '').trim().toLowerCase() === 'offline' ? (
                            <>
                              A conexão está <strong>pausada</strong>. Toque em <strong>Exibir código QR</strong> — o
                              sistema religa a instância e prepara o pareamento (pode levar até ~15 s). Se não aparecer,
                              use <strong>Reiniciar conexão</strong> em &quot;Precisa de ajuda?&quot; abaixo.
                            </>
                          ) : (
                            <>
                              No celular, abra o <strong>WhatsApp</strong> → menu (três pontos ou configurações) →{' '}
                              <strong>Aparelhos conectados</strong> → <strong>Conectar um aparelho</strong>. Depois toque
                              em <strong>Exibir código QR</strong> aqui e aponte a câmera para a tela.
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          Somente o dono da academia pode abrir o código QR nesta página. Use o botão acima para ver se a
                          conexão já foi feita.
                        </>
                      )}
                    </p>
                    {isOwner ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void zap.revealWaQrCode()}
                          disabled={zap.waLoading || zap.waTokenMissing}
                        >
                          {zap.waLoading ? 'Preparando QR…' : 'Exibir código QR'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}

                {zap.waQrShown && (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                      {waQrBlobUrl ? (
                        <img
                          src={waQrBlobUrl}
                          alt="QR Code WhatsApp"
                          onLoad={() => zap.onQrImageLoad()}
                          onError={() => zap.onQrImageError()}
                          style={{
                            width: 240,
                            height: 240,
                            objectFit: 'contain',
                            border: '1px solid var(--border)',
                            borderRadius: 12,
                            background: '#fff',
                          }}
                        />
                      ) : (
                        <div
                          className="text-small"
                          style={{
                            color: 'var(--text-secondary)',
                            textAlign: 'center',
                            padding: '12px 14px',
                            borderRadius: 10,
                            border: '1px dashed var(--border)',
                            lineHeight: 1.5,
                            minHeight: 120,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            maxWidth: 360,
                          }}
                        >
                          {zap.waConnected
                            ? 'WhatsApp já conectado. Não há QR disponível no momento.'
                            : zap.waQrError
                              ? 'Não foi possível carregar o QR (a instância pode estar pausada). Use "Gerar novo QR" ou "Reiniciar conexão" em Precisa de ajuda?'
                              : zap.waLoading
                                ? 'Preparando instância e QR… aguarde alguns segundos.'
                                : 'Carregando imagem do QR…'}
                        </div>
                      )}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
                        {isOwner && zap.waQrLoadFailedOnce && (
                          <button
                            type="button"
                            className="btn btn-outline"
                            style={{ padding: '8px 14px' }}
                            onClick={() => zap.refreshWaQrCode()}
                            disabled={zap.waLoading || zap.waTokenMissing}
                          >
                            Gerar novo QR
                          </button>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderRadius: 10,
                        borderLeft: '4px solid #25D366',
                        background: 'var(--surface)',
                        textAlign: 'left',
                      }}
                    >
                      <p className="text-small" style={{ margin: '0 0 10px', fontWeight: 600, color: 'var(--text)' }}>
                        No celular
                      </p>
                      <ol
                        className="text-small"
                        style={{ margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', lineHeight: 1.65 }}
                      >
                        <li>Abra o WhatsApp</li>
                        <li>Aparelhos conectados → Conectar um aparelho</li>
                        <li>Escaneie o código na tela</li>
                      </ol>
                      <p className="text-small" style={{ margin: '12px 0 0', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                        Depois de escanear no celular, o status atualiza sozinho em alguns segundos. Se não mudar, use{' '}
                        <strong>Atualizar status</strong>.
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {renderOwnerMaintenance()}

      <ConfirmDialog
        open={Boolean(waConfirm)}
        title={waConfirm?.title || ''}
        description={waConfirm?.description}
        confirmLabel={waConfirm?.confirmLabel || 'Confirmar'}
        loading={zap.waLoading}
        onConfirm={handleWaConfirmAction}
        onClose={() => (zap.waLoading ? undefined : setWaConfirm(null))}
      />
    </>
  );
}
