import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DoorOpen, History } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import RecepcaoLivePanel from '../attendance/RecepcaoLivePanel.jsx';
import AttendanceAtRiskSection from '../attendance/AttendanceAtRiskSection.jsx';
import RecepcaoPresenceHero from './RecepcaoPresenceHero.jsx';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { isAttendanceConfigured } from '../../lib/attendance.js';
import {
  RECEPCAO_CATRACA_SECTION_HISTORICO,
  RECEPCAO_CATRACA_SECTION_LIVE,
  RECEPCAO_CATRACA_SECTION_RETENCAO,
} from '../../lib/recepcaoHubTabs.js';

const ControlIdAttendancePanel = lazy(
  () => import('../attendance/ControlIdAttendancePanel.jsx')
);

/**
 * Aba Presença em / — feed ao vivo, histórico e retenção por frequência.
 */
export default function RecepcaoCatracaTab({
  catracaSection = RECEPCAO_CATRACA_SECTION_LIVE,
  onCatracaSectionChange,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const controlId = useAcademyControlId(academyId, { fetch: true });
  const integrationReady = controlId.configured && controlId.enabled;
  const attendanceReady = isAttendanceConfigured();

  const liveRef = useRef(null);
  const retentionRef = useRef(null);
  const [heroSummary, setHeroSummary] = useState(undefined);
  const [isPresenceDesktop, setIsPresenceDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 960px)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(min-width: 960px)');
    const onChange = () => setIsPresenceDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const showLive = catracaSection === RECEPCAO_CATRACA_SECTION_LIVE;
  const showHistorico = catracaSection === RECEPCAO_CATRACA_SECTION_HISTORICO;
  const showRetencao = catracaSection === RECEPCAO_CATRACA_SECTION_RETENCAO;

  const desktopSplitLive =
    isPresenceDesktop && showLive && !showHistorico && attendanceReady && integrationReady;

  const retentionVisible =
    Boolean(desktopSplitLive) ||
    Boolean(!desktopSplitLive && showRetencao && attendanceReady) ||
    Boolean(!integrationReady && attendanceReady && !showRetencao);

  const handleRetentionDataLoaded = useCallback((body) => {
    setHeroSummary(body?.summary ?? null);
  }, []);

  useEffect(() => {
    if (!retentionVisible) setHeroSummary(undefined);
  }, [retentionVisible]);

  const scrollToLive = () => {
    liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToRetention = () => {
    if (desktopSplitLive) {
      retentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_RETENCAO);
    requestAnimationFrame(() => {
      retentionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (controlId.loading) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }} role="status">
        Carregando presença…
      </p>
    );
  }

  if (!integrationReady && !attendanceReady) {
    return (
      <div className="card reception-section">
        <EmptyState
          insideCard
          variant="default"
          tone="dashed"
          icon={DoorOpen}
          title="Presença não configurada"
          description="Conecte o Control iD em Integrações para ver entradas ao vivo e liberar a porta na recepção."
          primaryAction={{
            label: 'Configurar catraca',
            href: '/integracoes?tab=catraca',
          }}
        />
      </div>
    );
  }

  const subTabs = integrationReady ? (
    <div className="mensal-page-tabs recepcao-presence-tabs" role="tablist" aria-label="Presença">
      <button
        type="button"
        role="tab"
        aria-selected={showLive || showRetencao}
        className={`mensal-page-tab${showLive || showRetencao ? ' mensal-page-tab--active' : ''}`}
        onClick={() => onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_LIVE)}
      >
        <DoorOpen size={14} aria-hidden />
        Ao vivo
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={showHistorico}
        className={`mensal-page-tab${showHistorico ? ' mensal-page-tab--active' : ''}`}
        onClick={() => onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_HISTORICO)}
      >
        <History size={14} aria-hidden />
        Histórico
      </button>
    </div>
  ) : null;

  return (
    <div className="recepcao-catraca-tab">
      <RecepcaoPresenceHero
        integrationReady={integrationReady}
        onScrollToLive={scrollToLive}
        onScrollToRetention={scrollToRetention}
        summaryOverride={retentionVisible ? heroSummary : undefined}
        skipFetch={retentionVisible}
      />

      {!integrationReady ? (
        <StatusBanner
          variant="info"
          className="reception-section"
          action={{ href: '/integracoes?tab=catraca', label: 'Configurar catraca' }}
        >
          Catraca Control iD não configurada. O feed ao vivo e a liberação remota ficam indisponíveis;
          check-ins manuais no perfil do aluno continuam contando para a retenção abaixo.
        </StatusBanner>
      ) : null}

      {!desktopSplitLive ? subTabs : null}

      {desktopSplitLive ? (
        <div className="recepcao-presence-grid">
          <div ref={liveRef} className="recepcao-presence-grid__live">
            <RecepcaoLivePanel />
          </div>
          <div ref={retentionRef} className="recepcao-presence-grid__retention">
            <AttendanceAtRiskSection
              layout="sidebar"
              onDataLoaded={handleRetentionDataLoaded}
            />
          </div>
        </div>
      ) : null}

      {!desktopSplitLive && showLive && integrationReady ? (
        <div ref={liveRef}>
          <RecepcaoLivePanel />
        </div>
      ) : null}

      {showHistorico && integrationReady ? (
        <Suspense
          fallback={<p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando histórico…</p>}
        >
          <ControlIdAttendancePanel showReceptionLink={false} />
        </Suspense>
      ) : null}

      {!desktopSplitLive && showRetencao && attendanceReady ? (
        <div ref={retentionRef}>
          <AttendanceAtRiskSection onDataLoaded={handleRetentionDataLoaded} />
        </div>
      ) : null}

      {!integrationReady && attendanceReady && !showRetencao ? (
        <div ref={retentionRef}>
          <AttendanceAtRiskSection onDataLoaded={handleRetentionDataLoaded} />
        </div>
      ) : null}

      {desktopSplitLive ? (
        <div className="recepcao-presence-historico-link">
          <button
            type="button"
            className="link-subtle text-small"
            onClick={() => onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_HISTORICO)}
          >
            Ver histórico de check-ins →
          </button>
        </div>
      ) : null}
    </div>
  );
}
