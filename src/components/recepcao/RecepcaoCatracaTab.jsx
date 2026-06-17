import React, { lazy, Suspense } from 'react';
import { DoorOpen, History } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';
import RecepcaoLivePanel from '../attendance/RecepcaoLivePanel.jsx';
import { useAcademyControlId } from '../../hooks/useAcademyControlId.js';
import { useLeadStore } from '../../store/useLeadStore.js';

const ControlIdAttendancePanel = lazy(
  () => import('../attendance/ControlIdAttendancePanel.jsx')
);

/**
 * Aba Catraca em / — feed ao vivo, histórico e empty state de integração.
 * @param {{ showHistorico?: boolean, onShowLive?: () => void, onShowHistorico?: () => void }} props
 */
export default function RecepcaoCatracaTab({
  showHistorico = false,
  onShowLive,
  onShowHistorico,
}) {
  const academyId = useLeadStore((s) => s.academyId);
  const controlId = useAcademyControlId(academyId, { fetch: true });
  const integrationReady = controlId.configured && controlId.enabled;

  if (!integrationReady && !controlId.loading) {
    return (
      <div className="card reception-section">
        <EmptyState
          insideCard
          variant="default"
          tone="dashed"
          icon={DoorOpen}
          title="Catraca não configurada"
          description="Conecte o Control iD em Integrações para ver entradas ao vivo e liberar a porta na recepção."
          primaryAction={{
            label: 'Configurar catraca',
            href: '/integracoes?tab=catraca',
          }}
        />
      </div>
    );
  }
  return (
    <div className="recepcao-catraca-tab">
      <div className="mensal-page-tabs" role="tablist" aria-label="Catraca" style={{ marginBottom: 20 }}>
        <button
          type="button"
          role="tab"
          aria-selected={!showHistorico}
          className={`mensal-page-tab${!showHistorico ? ' mensal-page-tab--active' : ''}`}
          onClick={onShowLive}
        >
          <DoorOpen size={14} aria-hidden />
          Ao vivo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={showHistorico}
          className={`mensal-page-tab${showHistorico ? ' mensal-page-tab--active' : ''}`}
          onClick={onShowHistorico}
        >
          <History size={14} aria-hidden />
          Histórico
        </button>
      </div>

      {!showHistorico ? (
        <RecepcaoLivePanel />
      ) : (
        <Suspense
          fallback={
            <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando histórico…</p>
          }
        >
          <ControlIdAttendancePanel showReceptionLink={false} />
        </Suspense>
      )}
    </div>
  );
}
