import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, DoorOpen, History } from 'lucide-react';
import { useTerms } from '../lib/terminology.js';
import RecepcaoLivePanel from '../components/attendance/RecepcaoLivePanel.jsx';
import ControlIdAttendancePanel from '../components/attendance/ControlIdAttendancePanel.jsx';

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
    <div
      className="recepcao-page"
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        display: 'flex',
        flexDirection: 'column',
        padding: '0 0 40px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 24px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          position: 'sticky',
          top: 0,
          zIndex: 10,
          flexWrap: 'wrap',
        }}
      >
        <Link
          to="/students"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 13,
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          {terms.students}
        </Link>

        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        <DoorOpen size={20} color="var(--v500)" />
        <span style={{ fontWeight: 700, fontSize: 18, color: 'var(--text)' }}>Recepção</span>
      </div>

      <div style={{ flex: 1, padding: '16px 24px 24px', maxWidth: 720, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        <div className="mensal-page-tabs" role="tablist" aria-label="Recepção" style={{ marginBottom: 20 }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`mensal-page-tab${tab === id ? ' mensal-page-tab--active' : ''}`}
              onClick={() => setTab(id)}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {tab === 'ao-vivo' ? (
          <RecepcaoLivePanel />
        ) : (
          <ControlIdAttendancePanel showReceptionLink={false} />
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
