import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { DoorOpen, History, Users } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import StatusBanner from '../shared/StatusBanner.jsx';
import RecepcaoLivePanel from '../attendance/RecepcaoLivePanel.jsx';
import AttendanceAtRiskSection from '../attendance/AttendanceAtRiskSection.jsx';
import RecepcaoPresenceHero from './RecepcaoPresenceHero.jsx';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { useLeadStore } from '../../store/useLeadStore.js';
import { isAttendanceConfigured } from '../../lib/attendance.js';
import { fetchControlIdAttendance } from '../../lib/controlidApi.js';
import { countRealFeedEntries } from '../../lib/recepcaoLiveFeed.js';
import { todayStartIso } from '../attendance/controlIdAttendanceUtils.js';
import {
  RECEPCAO_CATRACA_SECTION_HISTORICO,
  RECEPCAO_CATRACA_SECTION_LIVE,
  RECEPCAO_CATRACA_SECTION_RETENCAO,
  buildRecepcaoPresenceSubTabs,
} from '../../lib/recepcaoHubTabs.js';

const ControlIdAttendancePanel = lazy(
  () => import('../attendance/ControlIdAttendancePanel.jsx')
);

const TAB_ICONS = {
  [RECEPCAO_CATRACA_SECTION_LIVE]: DoorOpen,
  [RECEPCAO_CATRACA_SECTION_HISTORICO]: History,
  [RECEPCAO_CATRACA_SECTION_RETENCAO]: Users,
};

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
  const [entriesToday, setEntriesToday] = useState(null);
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

  const handleEntriesTodayChange = useCallback((count) => {
    setEntriesToday(typeof count === 'number' && Number.isFinite(count) ? count : 0);
  }, []);

  useEffect(() => {
    if (!academyId || !integrationReady) {
      setEntriesToday(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchControlIdAttendance(academyId, {
          start: todayStartIso(),
          limit: 100,
        });
        if (cancelled) return;
        setEntriesToday(countRealFeedEntries(data.records || []));
      } catch {
        /* LivePanel atualiza quando montar */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId, integrationReady]);

  const showLive = catracaSection === RECEPCAO_CATRACA_SECTION_LIVE;
  const showHistorico = catracaSection === RECEPCAO_CATRACA_SECTION_HISTORICO;
  const showRetencao = catracaSection === RECEPCAO_CATRACA_SECTION_RETENCAO;

  const desktopSplitLive =
    isPresenceDesktop && showLive && attendanceReady && integrationReady;

  const retentionVisible =
    Boolean(desktopSplitLive) ||
    Boolean(showRetencao && attendanceReady) ||
    Boolean(!integrationReady && attendanceReady && !showRetencao);

  const handleRetentionDataLoaded = useCallback((body) => {
    setHeroSummary(body?.summary ?? null);
  }, []);

  useEffect(() => {
    if (!retentionVisible) setHeroSummary(undefined);
  }, [retentionVisible]);

  const scrollToLive = () => {
    if (!showLive) {
      onCatracaSectionChange?.(RECEPCAO_CATRACA_SECTION_LIVE);
    }
    requestAnimationFrame(() => {
      liveRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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

  const presenceTabs = integrationReady
    ? buildRecepcaoPresenceSubTabs({ attendanceReady })
    : [];

  const subTabs =
    presenceTabs.length > 0 ? (
      <div className="mensal-page-tabs recepcao-presence-tabs" role="tablist" aria-label="Presença">
        {presenceTabs.map((tab) => {
          const Icon = TAB_ICONS[tab.id] || DoorOpen;
          const selected = catracaSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`mensal-page-tab${selected ? ' mensal-page-tab--active' : ''}`}
              onClick={() => onCatracaSectionChange?.(tab.id)}
            >
              <Icon size={14} aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>
    ) : null;

  return (
    <div className="recepcao-catraca-tab">
      <RecepcaoPresenceHero
        integrationReady={integrationReady}
        entriesToday={integrationReady ? entriesToday : null}
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

      {subTabs}

      {desktopSplitLive ? (
        <div className="recepcao-presence-grid">
          <div ref={liveRef} className="recepcao-presence-grid__live">
            <RecepcaoLivePanel onEntriesTodayChange={handleEntriesTodayChange} />
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
          <RecepcaoLivePanel onEntriesTodayChange={handleEntriesTodayChange} />
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
    </div>
  );
}
