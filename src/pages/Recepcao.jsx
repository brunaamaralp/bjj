import React, { lazy, Suspense } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, DoorOpen, History } from 'lucide-react';
import { useTerms } from '../lib/terminology.js';
import RecepcaoLivePanel from '../components/attendance/RecepcaoLivePanel.jsx';
import '../styles/recepcao.css';

const ControlIdAttendancePanel = lazy(
  () => import('../components/attendance/ControlIdAttendancePanel.jsx')
);

const TABS = [
  { id: 'ao-vivo', label: 'Ao vivo', icon: DoorOpen },
  { id: 'historico', label: 'Histórico', icon: History },
];

export default function Recepcao() {
  const terms = useTerms();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === 'historico' ? 'historico' : 'ao-vivo';

  const setTab = (id) => {
    if (id === 'ao-vivo') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: id }, { replace: true });
    }
  };

  return (
    <div className="recepcao-page">
      <div className="recepcao-page__header">
        <Link to="/students" className="recepcao-page__back">
          <ArrowLeft size={16} />
          {terms.students}
        </Link>

        <div className="recepcao-page__divider" aria-hidden />

        <DoorOpen size={20} color="var(--v500)" aria-hidden />
        <span className="recepcao-page__title">Recepção</span>
      </div>

      <div className="recepcao-page__body">
        <div className="mensal-page-tabs" role="tablist" aria-label="Recepção" style={{ marginBottom: 20 }}>
          {TABS.map(({ id, label, icon }) => {
            const TabIcon = icon;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`mensal-page-tab${tab === id ? ' mensal-page-tab--active' : ''}`}
                onClick={() => setTab(id)}
              >
                <TabIcon size={14} aria-hidden />
                {label}
              </button>
            );
          })}
        </div>

        {tab === 'ao-vivo' ? (
          <RecepcaoLivePanel />
        ) : (
          <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Carregando histórico…</p>}>
            <ControlIdAttendancePanel showReceptionLink={false} />
          </Suspense>
        )}
      </div>
    </div>
  );
}
