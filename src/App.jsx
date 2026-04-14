import React, { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutGrid,
  PlusCircle,
  User,
  ShoppingBag,
  Boxes,
  BarChart3,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  Kanban,
  GraduationCap,
  Bot,
  FileText
} from 'lucide-react';
import { authService } from './lib/auth';
import { databases, DB_ID, ACADEMIES_COL, STOCK_ITEMS_COL, INVENTORY_MOVE_FN_ID, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID, LEADS_COL, createSessionJwt, teams } from './lib/appwrite';
import { isBillingLive } from './lib/billingEnabled';
import { Query } from 'appwrite';
import { useLeadStore } from './store/useLeadStore';
import { useUiStore } from './store/useUiStore';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import LeadProfile from './pages/LeadProfile';
import NewLead from './pages/NewLead';
import Students from './pages/Students';
import UserAccount from './pages/UserAccount';
import AcademySettings from './pages/AcademySettings';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Templates from './pages/Templates';
import Inbox from './pages/Inbox';
import Plans from './pages/Plans';
import NaviLogo from './components/NaviLogo.jsx';
import NaviWordmark from './components/NaviWordmark.jsx';
import NaviToasts from './components/NaviToasts.jsx';
import OnboardingBanner from './components/OnboardingBanner.jsx';
import { useUserRole } from './lib/useUserRole';
import { parseOnboardingChecklist, trialDaysRemaining } from './lib/onboardingChecklist.js';

function defaultAiNameFromUser(user) {
  const raw = String(user?.name || '').trim();
  const first = raw.split(/\s+/).filter(Boolean)[0] || '';
  return (first || 'Nave').slice(0, 80);
}

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const setAcademyId = useLeadStore((s) => s.setAcademyId);
  const labels = useLeadStore((s) => s.labels);
  const setLabels = useLeadStore((s) => s.setLabels);
  const modules = useLeadStore((s) => s.modules);
  const setModules = useLeadStore((s) => s.setModules);
  const [academyList, setAcademyList] = useState([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem('naviSidebarCollapsed') === '1';
    } catch {
      return false;
    }
  });
  const isActive = (path) => location.pathname === path;
  const inboxUnread = useLeadStore((s) => s.inboxUnreadConversations);
  const academyIdStore = useLeadStore((s) => s.academyId);
  const billingAccessTop = useLeadStore((s) => s.billingAccess);

  const topbarTrialChip = useMemo(() => {
    if (!isBillingLive() || billingAccessTop?.status !== 'trial' || !billingAccessTop?.currentPeriodEnd) {
      return null;
    }
    const d = trialDaysRemaining(billingAccessTop.currentPeriodEnd);
    if (d == null) return null;
    return (
      <span
        className="text-small"
        style={{
          color: 'rgba(255,255,255,0.92)',
          fontWeight: 600,
          padding: '4px 10px',
          borderRadius: 8,
          background: 'rgba(255,255,255,0.12)',
          whiteSpace: 'nowrap',
        }}
        title={`Trial até ${new Date(billingAccessTop.currentPeriodEnd).toLocaleDateString('pt-BR')}`}
      >
        Trial: {d} dia{d === 1 ? '' : 's'}
      </span>
    );
  }, [billingAccessTop]);

  const inboxTabParam = useMemo(() => {
    const q = new URLSearchParams(location.search);
    return String(q.get('tab') || '').trim();
  }, [location.search]);

  const isEmpresaAgenteTab = location.pathname === '/empresa' && inboxTabParam === 'agente';
  const isInboxConversasNavActive = location.pathname === '/inbox';
  const isInboxPath = location.pathname === '/inbox';

  const academyDocForRole = useMemo(() => {
    if (!academyIdStore) return null;
    const a = academyList.find((x) => x.id === academyIdStore);
    if (!a) return null;
    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
  }, [academyList, academyIdStore]);

  const navRole = useUserRole(academyDocForRole);
  const canConfigureAgenteIa = navRole === 'owner' || navRole === 'member';

  const sideLinkClass = ({ isActive: navIsActive }) =>
    `navi-side-link${navIsActive ? ' active' : ''}`;

  /** Garante trial no servidor (chamar uma vez após definir academia). */
  const syncBilling = async (academyId) => {
    if (!isBillingLive() || !academyId) return;
    try {
      const jwt = await createSessionJwt();
      if (!jwt) return;
      await fetch('/api/billing/ensure-trial', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ storeId: academyId }),
      });
    } catch (e) {
      void e;
    }
  };

  /**
   * needsPlan: na 1ª navegação da sessão só toast; da 2ª em diante redireciona para /planos (contador em sessionStorage).
   */
  const applyBillingNeedsPlanNudge = React.useCallback(
    (data) => {
      if (!data?.sucesso || !data.needsPlan || location.pathname === '/planos') return;
      let hits = 0;
      try {
        hits = parseInt(sessionStorage.getItem('navi_billing_needsplan_navs') || '0', 10);
      } catch {
        hits = 0;
      }
      if (hits === 0) {
        try {
          sessionStorage.setItem('navi_billing_needsplan_navs', '1');
          useUiStore.getState().addToast({
            type: 'warning',
            message:
              'Quando o trial acabar, será preciso escolher um plano. Abra Planos ou Conta → Assinatura quando quiser configurar.',
            duration: 9000,
          });
        } catch {
          void 0;
        }
        return;
      }
      navigate('/planos');
    },
    [location.pathname, navigate]
  );

  useEffect(() => {
    if (!user || !academyIdStore || !isBillingLive()) {
      useLeadStore.getState().setBillingAccess(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const jwt = await createSessionJwt();
        if (!jwt || cancelled) return;
        const st = await fetch(`/api/billing/status?storeId=${encodeURIComponent(academyIdStore)}`, {
          headers: { Authorization: `Bearer ${jwt}` },
        });
        const data = await st.json().catch(() => ({}));
        if (cancelled) return;
        if (data.sucesso) {
          useLeadStore.getState().setBillingAccess({
            status: data.status,
            currentPeriodEnd: data.currentPeriodEnd,
            needsPlan: data.needsPlan,
            accessLevel: data.accessLevel,
            companyTaxOk: data.companyTaxOk !== false,
          });
          if (data.companyTaxOk === true) {
            const cl = useLeadStore.getState().onboardingChecklist;
            const taxItem = cl?.find((x) => x.id === 'company_tax');
            if (taxItem && !taxItem.done) {
              void useLeadStore.getState().completeOnboardingStepIds(['company_tax']);
            }
          }
          applyBillingNeedsPlanNudge(data);
        }
      } catch {
        void 0;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, academyIdStore, location.pathname, applyBillingNeedsPlanNudge]);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem('naviSidebarCollapsed', next ? '1' : '0');
      } catch (e) { void e; }
      return next;
    });
  };

  // Check session on mount
  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          try { useLeadStore.getState().setUserId(currentUser.$id); } catch (e) { void e; }
          try { await authService.refreshJwt(); } catch (e) { void e; }
          await setupAcademy(currentUser);
          try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) { void e; }
          navigate('/', { replace: true });
        } else {
          const p = window.location.pathname;
          const authPaths = ['/login', '/register', '/cadastro'];
          if (!authPaths.includes(p)) {
            navigate('/', { replace: true });
          }
        }
      } catch {
        const p = window.location.pathname;
        const authPaths = ['/login', '/register', '/cadastro'];
        if (!authPaths.includes(p)) {
          navigate('/', { replace: true });
        }
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Create or find academy for user
  const setupAcademy = async (u) => {
    try {
      if (!u || !u.$id) {
        throw new Error('invalid_user');
      }
      let list = [];
      try {
        const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
          Query.equal('ownerId', [u.$id]),
          Query.limit(50),
        ]);
        list = res.documents || [];
      } catch (e) {
        console.error('Erro ao buscar academias como dono:', e);
      }

      if (list.length === 0) {
        try {
          const memberships = await teams.list();
          const teamIds = (memberships.teams || []).map(m => m.$id);
          if (teamIds.length > 0) {
            const memberOf = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
              Query.equal('teamId', teamIds),
              Query.limit(50)
            ]);
            list = memberOf.documents || [];
          }
      } catch (e) {
        console.error('Erro ao buscar academias como membro:', e);
        }
      }

      const needsSingletonAcademyList = list.length === 0;

      let academyId = null;
      const mappedAcademies = list.map((d) => ({
        id: d.$id,
        name: d.name || d.$id,
        ownerId: String(d?.ownerId || ''),
        teamId: String(d?.teamId || ''),
      }));
      setAcademyList(mappedAcademies);
      try {
        useLeadStore.getState().setAcademyList(mappedAcademies);
      } catch (e) {
        void e;
      }
      const saved = localStorage.getItem('activeAcademyId');
      if (saved && list.find(d => d.$id === saved)) {
        academyId = saved;
      } else if (list.length > 0) {
        academyId = list[0].$id;
      } else {
        const jwt = await createSessionJwt();
        const resp = await fetch('/api/academies/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`
          },
          body: JSON.stringify({ ai_name: defaultAiNameFromUser(u) })
        });
        const data = await resp.json().catch(() => ({}));
        if (resp.ok && data && data.id) {
          academyId = data.id;
        } else {
          const detail = data?.erro || data?.error || `HTTP ${resp.status}`;
          console.error('[setupAcademy] /api/academies/create falhou:', resp.status, detail);
          throw new Error(
            typeof detail === 'string' ? detail : 'Não foi possível criar a academia. Tente de novo ou fale com o suporte.'
          );
        }
      }
      setAcademyId(academyId);
      localStorage.setItem('activeAcademyId', academyId);
      useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        let ensuredTeamId = String(doc?.teamId || '').trim();
        if (!ensuredTeamId) {
          try {
            const jwt = await createSessionJwt();
            const resp = await fetch('/api/academies/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ ai_name: defaultAiNameFromUser(u) })
            });
            const data = await resp.json().catch(() => ({}));
            if (resp.ok && data && data.teamId) {
              ensuredTeamId = String(data.teamId || '').trim();
              doc.teamId = ensuredTeamId;
            }
          } catch { void 0; }
        }
        try { useLeadStore.getState().setTeamId(ensuredTeamId || null); } catch (e) { void e; }
        try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
        try {
          const createId = () => {
            try {
              if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
            } catch { void 0; }
            const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).slice(1);
            return `${s4()}${s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
          };

          let raw = [];
          if (doc.customLeadQuestions) {
            raw = typeof doc.customLeadQuestions === 'string' ? JSON.parse(doc.customLeadQuestions) : doc.customLeadQuestions;
            if (!Array.isArray(raw)) raw = [];
          }

          let migrated = false;
          let list = [];
          if (raw.length > 0 && typeof raw[0] === 'string') {
            migrated = true;
            list = raw.map((label) => String(label || '').trim()).filter(Boolean).map((label) => ({ id: createId(), label, type: 'text' }));
          } else {
            list = raw.map((q) => {
              const label = String(q?.label || q?.name || '').trim();
              let id = String(q?.id || '').trim();
              const type = String(q?.type || 'text').trim() || 'text';
              const options = Array.isArray(q?.options)
                ? q.options.filter(Boolean).map((s) => String(s).trim()).filter(Boolean)
                : (typeof q?.options === 'string'
                  ? q.options.split(',').map((s) => s.trim()).filter(Boolean)
                  : undefined);
              if (!label) { migrated = true; return null; }
              if (!id) { migrated = true; id = createId(); }
              if (q?.label !== label || q?.id !== id || q?.type !== type) migrated = true;
              const base = { id, label, type };
              if (type === 'select') return { ...base, options: options || [] };
              return base;
            }).filter(Boolean);
          }

          if (migrated) {
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
              customLeadQuestions: JSON.stringify(list)
            }).catch(e => {
              console.warn('[setupAcademy] Failed to update customLeadQuestions, probably due to permissions:', e);
            });
            doc.customLeadQuestions = JSON.stringify(list);
          }
        } catch (e) { void e; }
        let uiLabels = null;
        let mods = null;
        try {
          if (doc.uiLabels) {
            uiLabels = typeof doc.uiLabels === 'string' ? JSON.parse(doc.uiLabels) : doc.uiLabels;
          }
          if (doc.modules) {
            mods = typeof doc.modules === 'string' ? JSON.parse(doc.modules) : doc.modules;
          }
        } catch { uiLabels = null; mods = null; }
        if (uiLabels && typeof uiLabels === 'object') {
          setLabels({
            leads: uiLabels.leads || 'Leads',
            students: uiLabels.students || 'Alunos',
            classes: uiLabels.classes || 'Aulas',
            pipeline: uiLabels.pipeline || 'Funil',
          });
        }
        if (mods && typeof mods === 'object') {
          setModules({
            sales: Boolean(mods.sales),
            inventory: Boolean(mods.inventory),
            finance: Boolean(mods.finance),
          });
        } else {
          setModules({ sales: false, inventory: false, finance: false });
        }
        try {
          useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(doc.onboardingChecklist));
        } catch (e) { void e; }
        if (needsSingletonAcademyList && doc) {
          const single = [
            {
              id: academyId,
              name: doc.name || academyId,
              ownerId: String(doc.ownerId || u.$id || ''),
              teamId: String(doc.teamId || ''),
            },
          ];
          setAcademyList(single);
          try {
            useLeadStore.getState().setAcademyList(single);
          } catch (e2) {
            void e2;
          }
        }
      } catch (e) {
        void e;
        useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      }
      // Fetch leads after academy is set
      useLeadStore.getState().setAcademyId(academyId);
      await useLeadStore.getState().fetchLeads();
      await syncBilling(academyId);
    } catch (e) {
      console.error('Erro ao carregar academia:', e);
      // Exibir mensagem clara para o usuário
      // setError('Não foi possível carregar sua academia. Tente novamente ou entre em contato com o administrador.');
      // Como estamos no App.jsx e não temos 'setError' local, usaremos o toast
      try {
        useUiStore.getState().addToast({
          type: 'error',
          message: 'Não foi possível carregar sua academia. Tente novamente ou entre em contato com o administrador.',
          duration: 6000
        });
      } catch (toastErr) {
        console.error(toastErr);
      }
      // NÃO fazer logout automático
    }
  };

  const handleLogin = async (u) => {
    if (!u || !u.$id) {
      navigate('/login', { replace: true });
      return;
    }
    setUser(u);
    try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
    try { await authService.refreshJwt(); } catch (e) { void e; }
    await setupAcademy(u);
    try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) { void e; }
    navigate('/', { replace: true });
  };

  const handleLogout = async () => {
    try {
      sessionStorage.removeItem('navi_billing_needsplan_navs');
    } catch {
      void 0;
    }
    await authService.logout();
    setUser(null);
    useLeadStore.getState().setAcademyId(null);
    useLeadStore.getState().setAcademyList([]);
    useLeadStore.getState().setInboxUnreadConversations(0);
    useLeadStore.setState({ leads: [] });
  };

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          background: 'var(--v900)',
        }}
      >
        <NaviLogo size={48} variant="white" />
        <div className="navi-loading-spinner" aria-hidden />
        <style dangerouslySetInnerHTML={{
          __html: `
          .navi-loading-spinner {
            width: 32px; height: 32px;
            border: 3px solid rgba(123, 99, 212, 0.35);
            border-top-color: var(--v200);
            border-radius: 50%;
            animation: navi-spin 0.7s cubic-bezier(0.45, 0, 0.55, 1) infinite;
          }
          @keyframes navi-spin { to { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-container">
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/welcome" element={<Navigate to="/" replace />} />
          <Route path="/cadastro" element={<Register onLogin={handleLogin} />} />
          <Route path="/register" element={<Register onLogin={handleLogin} />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    );
  }

  const academySelect = academyList && academyList.length > 1 && (
    <select
      className="navi-topbar-select"
      value={useLeadStore.getState().academyId || ''}
      onChange={async (e) => {
        const id = e.target.value;
        setAcademyId(id);
        useLeadStore.getState().setInboxUnreadConversations(0);
        localStorage.setItem('activeAcademyId', id);
        useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
        try {
          const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, id);
          let uiLabels = null;
          let mods = null;
          try {
            if (doc.uiLabels) {
              uiLabels = typeof doc.uiLabels === 'string' ? JSON.parse(doc.uiLabels) : doc.uiLabels;
            }
            if (doc.modules) {
              mods = typeof doc.modules === 'string' ? JSON.parse(doc.modules) : doc.modules;
            }
          } catch { uiLabels = null; mods = null; }
          if (uiLabels && typeof uiLabels === 'object') {
            setLabels({
              leads: uiLabels.leads || 'Leads',
              students: uiLabels.students || 'Alunos',
              classes: uiLabels.classes || 'Aulas',
              pipeline: uiLabels.pipeline || 'Funil',
            });
          }
          if (mods && typeof mods === 'object') {
            setModules({
              sales: Boolean(mods.sales),
              inventory: Boolean(mods.inventory),
              finance: Boolean(mods.finance),
            });
          }
          useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(doc.onboardingChecklist));
        } catch (e) {
          void e;
          useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
        }
        await useLeadStore.getState().fetchLeads();
      }}
    >
      {academyList.map((a) => (
        <option key={a.id} value={a.id}>{a.name}</option>
      ))}
    </select>
  );

  return (
    <div className="app-container navi-authed">
      <div className="navi-shell">
        <aside
          className={`navi-sidebar${sidebarCollapsed ? ' navi-sidebar--collapsed' : ''}`}
          aria-label="Menu principal"
        >
          <div className="navi-sidebar-header">
            {!sidebarCollapsed ? (
              <>
                <div className="navi-sidebar-brand">
                  <NaviLogo size={24} />
                  <NaviWordmark fontSize={17} />
                </div>
                <button
                  type="button"
                  className="navi-sidebar-toggle"
                  onClick={toggleSidebar}
                  aria-expanded
                  aria-controls="navi-sidebar-nav"
                  title="Recolher menu"
                >
                  <ChevronLeft size={18} strokeWidth={2} aria-hidden />
                </button>
              </>
            ) : (
              <>
                <div className="navi-sidebar-brand navi-sidebar-brand--collapsed">
                  <NaviLogo size={26} />
                </div>
                <button
                  type="button"
                  className="navi-sidebar-toggle"
                  onClick={toggleSidebar}
                  aria-expanded={false}
                  aria-controls="navi-sidebar-nav"
                  title="Expandir menu"
                >
                  <ChevronRight size={18} strokeWidth={2} aria-hidden />
                </button>
              </>
            )}
          </div>

          <nav id="navi-sidebar-nav" className="navi-sidebar-nav">
            <div className="navi-side-section">
              <span className="navi-side-section-title">CRM</span>
              <NavLink
                to="/"
                end
                className={sideLinkClass}
                title={sidebarCollapsed ? 'Início' : undefined}
              >
                <LayoutGrid size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Início</span>
              </NavLink>
              <NavLink
                to="/pipeline"
                className={sideLinkClass}
                title={sidebarCollapsed ? (labels.pipeline || 'Funil') : undefined}
              >
                <Kanban size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">{labels.pipeline || 'Funil'}</span>
              </NavLink>
              <NavLink
                to="/students"
                className={sideLinkClass}
                title={sidebarCollapsed ? labels.students : undefined}
              >
                <GraduationCap size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">{labels.students}</span>
              </NavLink>
              <NavLink
                to="/reports"
                className={sideLinkClass}
                title={sidebarCollapsed ? 'Relatórios' : undefined}
              >
                <BarChart3 size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Relatórios</span>
              </NavLink>
            </div>

            <div className="navi-side-section">
              <span className="navi-side-section-title">Atendimento</span>
              <Link
                to="/inbox"
                className={`navi-side-link${isInboxConversasNavActive ? ' active' : ''}`}
                title={sidebarCollapsed ? 'Conversas' : undefined}
              >
                <MessageCircle size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Conversas</span>
                {inboxUnread > 0 && (
                  <span className="navi-inbox-unread-dot" title={`${inboxUnread} conversa(s) com mensagens não lidas`} aria-hidden />
                )}
              </Link>
              {canConfigureAgenteIa && (
                <Link
                  to="/empresa?tab=agente"
                  className={`navi-side-link${isEmpresaAgenteTab ? ' active' : ''}`}
                  title={sidebarCollapsed ? 'Agente IA' : undefined}
                >
                  <Bot size={18} strokeWidth={1.75} />
                  <span className="navi-side-link-label">Agente IA</span>
                </Link>
              )}
              <NavLink
                to="/templates"
                className={sideLinkClass}
                title={sidebarCollapsed ? 'Templates' : undefined}
              >
                <FileText size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Templates</span>
              </NavLink>
            </div>

            {((modules.inventory === true) || (modules.sales === true)) && (
              <div className="navi-side-section">
                <span className="navi-side-section-title">Operações</span>
                {modules.inventory === true && (
                  <NavLink
                    to="/estoque"
                    className={sideLinkClass}
                    title={sidebarCollapsed ? 'Estoque' : undefined}
                  >
                    <Boxes size={18} strokeWidth={1.75} />
                    <span className="navi-side-link-label">Estoque</span>
                  </NavLink>
                )}
                {modules.sales === true && (
                  <NavLink
                    to="/vendas"
                    className={sideLinkClass}
                    title={sidebarCollapsed ? 'Vendas' : undefined}
                  >
                    <ShoppingBag size={18} strokeWidth={1.75} />
                    <span className="navi-side-link-label">Vendas</span>
                  </NavLink>
                )}
              </div>
            )}

            <div className="navi-side-section">
              <NavLink
                to="/empresa"
                className={({ isActive }) => `navi-side-link${isActive ? ' active' : ''}`}
                title={sidebarCollapsed ? 'Minha academia' : undefined}
              >
                <Building2 size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Minha academia</span>
              </NavLink>
              <NavLink
                to="/conta"
                className={({ isActive }) => `navi-side-link${isActive ? ' active' : ''}`}
                title={sidebarCollapsed ? 'Conta' : undefined}
              >
                <User size={18} strokeWidth={1.75} />
                <span className="navi-side-link-label">Conta</span>
              </NavLink>
            </div>
          </nav>
        </aside>

        <div className="navi-main-stack">
          <header className="navi-topbar">
            <div className="navi-topbar-brand-slot">
              <button type="button" className="navi-topbar-brand" onClick={() => navigate('/')}>
                <NaviLogo size={22} variant="white" />
                <NaviWordmark fontSize={18} variant="light" />
              </button>
            </div>
            <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {topbarTrialChip}
              {academySelect}
              <button type="button" className="navi-topbar-logout" onClick={handleLogout}>
                Sair
              </button>
            </div>
          </header>

          {(() => {
            const missing = [];
            if (!DB_ID) missing.push('VITE_APPWRITE_DATABASE_ID');
            if (!LEADS_COL) missing.push('VITE_APPWRITE_LEADS_COLLECTION_ID');
            if (!ACADEMIES_COL) missing.push('VITE_APPWRITE_ACADEMIES_COLLECTION_ID');
            if (modules.inventory === true) {
              if (!STOCK_ITEMS_COL) missing.push('VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID');
              if (!INVENTORY_MOVE_FN_ID) missing.push('VITE_APPWRITE_INVENTORY_MOVE_FN_ID');
            }
            if (modules.sales === true) {
              if (!STOCK_ITEMS_COL) missing.push('VITE_APPWRITE_STOCK_ITEMS_COLLECTION_ID');
              if (!SALES_CREATE_FN_ID) missing.push('VITE_APPWRITE_SALES_CREATE_FN_ID');
              if (!SALES_CANCEL_FN_ID) missing.push('VITE_APPWRITE_SALES_CANCEL_FN_ID');
            }
            return missing.length > 0 && (
              <div style={{ background: 'var(--warn-bg)', color: 'var(--warn-text)', padding: '10px 20px', fontSize: 13 }}>
                <span className="text-small" style={{ color: 'inherit' }}>
                  Algumas configurações do Appwrite estão ausentes: {missing.join(', ')}.
                </span>
              </div>
            );
          })()}

          <main className="main-content">
            <OnboardingBanner />
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/login" element={<Navigate to="/" replace />} />
              <Route path="/register" element={<Navigate to="/" replace />} />
              <Route path="/cadastro" element={<Navigate to="/" replace />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/lead/:id" element={<LeadProfile />} />
              <Route path="/new-lead" element={<NewLead />} />
              <Route path="/reports" element={<Reports />} />
              {modules.inventory === true && <Route path="/estoque" element={<Inventory />} />}
              {modules.sales === true && <Route path="/vendas" element={<Sales />} />}
              <Route path="/students" element={<Students />} />
              <Route path="/conta" element={<UserAccount user={user} onLogout={handleLogout} />} />
              <Route path="/planos" element={<Plans user={user} />} />
              <Route path="/empresa" element={<AcademySettings />} />
              <Route path="/profile" element={<Navigate to="/conta" replace />} />
              <Route path="/templates" element={<Templates />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>

      <nav className="navi-bottom-nav" aria-label="Navegação">
        <Link to="/" className={`navi-nav-item ${isActive('/') ? 'active' : ''}`}>
          <LayoutGrid size={22} strokeWidth={1.75} />
          <span>Início</span>
        </Link>
        <Link to="/pipeline" className={`navi-nav-item ${isActive('/pipeline') ? 'active' : ''}`}>
          <Kanban size={22} strokeWidth={1.75} />
          <span>{labels.pipeline || 'Funil'}</span>
        </Link>
        <Link to="/inbox" className={`navi-nav-item ${isInboxPath ? 'active' : ''}`}>
          <MessageCircle size={22} strokeWidth={1.75} />
          {inboxUnread > 0 && (
            <span className="navi-inbox-unread-dot" title={`${inboxUnread} conversa(s) com mensagens não lidas`} aria-hidden />
          )}
          <span>Conversas</span>
        </Link>
        <Link to="/new-lead" className="navi-nav-item navi-nav-fab">
          <div className="navi-fab-btn">
            <PlusCircle size={28} strokeWidth={1.75} />
          </div>
        </Link>
        <Link to="/students" className={`navi-nav-item ${isActive('/students') ? 'active' : ''}`}>
          <GraduationCap size={22} strokeWidth={1.75} />
          <span>{labels.students}</span>
        </Link>
        {modules.sales === true && (
          <Link to="/vendas" className={`navi-nav-item ${isActive('/vendas') ? 'active' : ''}`}>
            <ShoppingBag size={22} strokeWidth={1.75} />
            <span>Loja</span>
          </Link>
        )}
        <Link to="/conta" className={`navi-nav-item ${location.pathname === '/conta' ? 'active' : ''}`}>
          <User size={22} strokeWidth={1.75} />
          <span>Conta</span>
        </Link>
      </nav>

      <NaviToasts />

      <style dangerouslySetInnerHTML={{
        __html: `
          /* Topbar usa fundo var(--v900): estes RGBA são intencionais para contraste no tema escuro. */
          .navi-topbar-select {
            max-width: 220px;
            padding: 8px 12px;
            border-radius: 8px;
            border: 0.5px solid rgba(255,255,255,0.2);
            background: rgba(255,255,255,0.08);
            color: white;
            font-family: var(--ff-ui);
            font-size: 13px;
          }
          .navi-topbar-select option { color: var(--ink); background: var(--white); }
          .navi-topbar-logout {
            background: transparent;
            color: rgba(255,255,255,0.85);
            border: 0.5px solid rgba(255,255,255,0.35);
            border-radius: 9px;
            padding: 8px 16px;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            min-height: auto;
            transition: background 0.15s ease, border-color 0.15s ease;
          }
          .navi-topbar-logout:hover {
            background: rgba(255,255,255,0.1);
            border-color: rgba(255,255,255,0.5);
          }
        `}} />
    </div>
  );
};

export default App;
