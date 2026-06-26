import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authService } from '../../lib/auth';
import { fetchPortalContext } from '../../lib/portalApi';
import {
  getPortalActiveStudentId,
  setPortalActiveAcademyId,
  setPortalActiveStudentId,
  resolveActiveStudentFromContext,
  clearPortalSession,
} from '../../lib/portalSession';
import PortalNav from '../../components/portal/PortalNav.jsx';
import PortalStudentSwitcher from '../../components/portal/PortalStudentSwitcher.jsx';
import ErrorBanner from '../../components/shared/ErrorBanner.jsx';
import { friendlyError } from '../../lib/errorMessages';
import '../../styles/portal.css';

const PortalContext = createContext(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal outside PortalLayout');
  return ctx;
}

export default function PortalLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [context, setContext] = useState(null);
  const [activeStudentId, setActiveStudentId] = useState(getPortalActiveStudentId);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const user = await authService.getCurrentUser();
      if (!user) {
        navigate('/portal/login', { replace: true });
        return;
      }
      const ctx = await fetchPortalContext({
        academyId: context?.academy_id,
        studentId: activeStudentId,
      });
      const sid = resolveActiveStudentFromContext(ctx);
      setPortalActiveStudentId(sid);
      setPortalActiveAcademyId(ctx.academy_id);
      setActiveStudentId(sid);
      setContext({ ...ctx, active_student_id: sid });
    } catch (e) {
      setError(friendlyError(e, 'load'));
    } finally {
      setLoading(false);
    }
  }, [navigate, context?.academy_id, activeStudentId]);

  useEffect(() => {
    void reload();
  }, []);

  const value = useMemo(
    () => ({
      context,
      activeStudentId,
      setActiveStudentId: (id) => {
        setPortalActiveStudentId(id);
        setActiveStudentId(id);
      },
      reload,
      logout: async () => {
        clearPortalSession();
        try {
          await authService.logout();
        } catch {
          void 0;
        }
        navigate('/portal/login', { replace: true });
      },
    }),
    [context, activeStudentId, reload, navigate]
  );

  if (loading) {
    return (
      <div className="portal-shell">
        <main className="portal-main">
          <p className="portal-card__muted">Carregando portal…</p>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="portal-shell">
        <main className="portal-main">
          <ErrorBanner message={error} onRetry={() => void reload()} />
        </main>
      </div>
    );
  }

  if (!context?.students?.length) {
    return <Navigate to="/portal/login" replace />;
  }

  const activeStudent = context.students.find((s) => s.id === activeStudentId) || context.students[0];

  if (
    activeStudent?.must_change_password &&
    !location.pathname.startsWith('/portal/trocar-senha')
  ) {
    return <Navigate to="/portal/trocar-senha" replace />;
  }

  return (
    <PortalContext.Provider value={value}>
      <div className="portal-shell">
        <header className="portal-header">
          <div className="portal-header__academy">{context.academy?.name || 'Portal'}</div>
          <PortalStudentSwitcher
            students={context.students}
            activeStudentId={activeStudentId}
            onChange={(id) => {
              value.setActiveStudentId(id);
              void reload();
            }}
          />
        </header>
        <main className="portal-main">
          <Outlet context={{ activeStudent, academy: context.academy }} />
        </main>
        <PortalNav />
      </div>
    </PortalContext.Provider>
  );
}
