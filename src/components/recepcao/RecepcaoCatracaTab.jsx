import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { DoorOpen, History, Users } from 'lucide-react';
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
  const [heroRefreshSignal, setHeroRefreshSignal] = useState(0);
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

  const subTabs = (
    <div className="mensal-page-tabs recepcao-presence-tabs" role="tablist" aria-label="Presença">
      {integrationReady ? (
        <button
          type="button"
          role="tab"
          aria-selected={showLive}
          className={`mensal-page-tab${showLive ? ' mensal-page-tab--active' : ''}`}
          onClick={() => onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_LIVE)}
        >
          <DoorOpen size={14} aria-hidden />
          Ao vivo
        </button>
      ) : null}
      {integrationReady ? (
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
      ) : null}
      {attendanceReady ? (
        <button
          type="button"
          role="tab"
          aria-selected={showRetencao}
          className={`mensal-page-tab${showRetencao ? ' mensal-page-tab--active' : ''}`}
          onClick={() => onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_RETENCAO)}
        >
          <Users size={14} aria-hidden />
          Retenção
        </button>
      ) : null}
    </div>
  );

  return (
    <div className="recepcao-catraca-tab">
      <RecepcaoPresenceHero
        integrationReady={integrationReady}
        onScrollToLive={scrollToLive}
        onScrollToRetention={scrollToRetention}
        refreshSignal={heroRefreshSignal}
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
              onDataLoaded={() => setHeroRefreshSignal((n) => n + 1)}
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
          <AttendanceAtRiskSection onDataLoaded={() => setHeroRefreshSignal((n) => n + 1)} />
        </div>
      ) : null}

      {!integrationReady && attendanceReady && !showRetencao ? (
        <div ref={retentionRef}>
          <AttendanceAtRiskSection onDataLoaded={() => setHeroRefreshSignal((n) => n + 1)} />
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
