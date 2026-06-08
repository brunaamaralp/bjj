import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutGrid,
  PlusCircle,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Grid2x2,
} from 'lucide-react';
import { authService } from './lib/auth';
import { databases, DB_ID, ACADEMIES_COL, STOCK_ITEMS_COL, INVENTORY_MOVE_FN_ID, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID, LEADS_COL, createSessionJwt, teams } from './lib/appwrite';
import { isBillingLive } from './lib/billingEnabled';
import { Query } from 'appwrite';
import { useLeadStore, cancelFetchLeads } from './store/useLeadStore';
import { useStudentStore, cancelFetchStudents } from './store/useStudentStore';
import {
  getAcademyDocument,
  applyAcademyDocToLeadStore,
} from './lib/getAcademyDocument.js';
import { cleanOldAccountingCache } from './store/useAccountingStore';
import { useUiStore } from './store/useUiStore';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';
import { prefetchFinanceConfig } from './lib/prefetchFinanceConfig.js';
import NaviUserMenu from './components/layout/NaviUserMenu.jsx';
import ErrorBanner from './components/shared/ErrorBanner.jsx';
import { OfflineBanner } from './components/shared/OfflineBanner.jsx';
import {
  PlanosRedirect,
  FinanceRedirect,
  CaixaRedirect,
  MensalidadesRedirect,
  ContratosRedirect,
  ContratosModelosRedirect,
  LojaTabRedirect,
  TemplatesRedirect,
} from './components/routing/LegacyRedirects.jsx';

import { lazyWithRetry } from './lib/lazyWithRetry.js';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Pipeline = lazyWithRetry(() => import('./pages/Pipeline'));
const LeadProfile = lazyWithRetry(() => import('./pages/LeadProfile'));
const StudentProfile = lazyWithRetry(() => import('./pages/StudentProfile'));
const NewLead = lazyWithRetry(() => import('./pages/NewLead'));
const Tasks = lazyWithRetry(() => import('./pages/Tasks'));

const Inbox = lazyWithRetry(() => import('./pages/Inbox'));
const Reports = lazyWithRetry(() => import('./pages/Reports'));
const AIAgentSettings = lazyWithRetry(() => import('./pages/AIAgentSettings'));
const UserAccount = lazyWithRetry(() => import('./pages/UserAccount'));
const AcademySettings = lazyWithRetry(() => import('./pages/AcademySettings'));
const Automacoes = lazyWithRetry(() => import('./pages/Automacoes'));
const Mensalidades = lazyWithRetry(() => import('./pages/Mensalidades'));
const Caixa = lazyWithRetry(() => import('./pages/Caixa'));
const Inventory = lazyWithRetry(() => import('./pages/Inventory'));
const Products = lazyWithRetry(() => import('./pages/Products'));
const Sales = lazyWithRetry(() => import('./pages/Sales'));
const Loja = lazyWithRetry(() => import('./pages/Loja'));
const Equipe = lazyWithRetry(() => import('./pages/Equipe'));
const Integracoes = lazyWithRetry(() => import('./pages/Integracoes'));
const Attendance = lazyWithRetry(() => import('./pages/Attendance'));
const Recepcao = lazyWithRetry(() => import('./pages/Recepcao'));
const Alunos = lazyWithRetry(() => import('./pages/Alunos'));
const PublicStudentEnrollment = lazyWithRetry(() => import('./pages/PublicStudentEnrollment'));
import NaviLogo from './components/NaviLogo.jsx';
import NaviBrandLockup from './components/NaviBrandLockup.jsx';
import NaviToasts from './components/NaviToasts.jsx';
import OnboardingBanner from './components/OnboardingBanner.jsx';
import { useUserRole } from './lib/useUserRole';
import { parseOnboardingChecklist, trialDaysRemaining } from './lib/onboardingChecklist.js';
import NotificationBell from './components/layout/NotificationBell.jsx';
import { useTerms } from './lib/terminology.js';
import { buildMobileDrawerSections, getNewLeadLabel, isStudentProfilePath } from './lib/naviMenu.js';
import { buildMobileMoreItems, isBottomNavMaisActive } from './lib/mobileMoreNav.js';
import NaviMobileMoreSheet from './components/layout/NaviMobileMoreSheet.jsx';
import NaviMobileDrawer from './components/layout/NaviMobileDrawer.jsx';
import { NAV_PUSH_EVENT } from './lib/navPush.js';
import { OPEN_NOVA_VENDA_MODAL_EVENT } from './lib/novaVendaModal.js';
import NaviSidebarNav from './components/layout/NaviSidebarNav.jsx';
import NovaVendaModal from './components/sales/NovaVendaModal.jsx';
import NlCommandBar, { NlCommandBarTrigger } from './components/NlCommandBar.jsx';
import { resolveNlContext } from './lib/nlCommandRouteContext.js';
import { useNlCommandStore } from './store/useNlCommandStore.js';
import ErrorBoundary from './components/shared/ErrorBoundary.jsx';
import RouteFallback from './components/shared/RouteFallback.jsx';
import PageSkeleton from './components/shared/PageSkeleton.jsx';


function defaultAiNameFromUser(user) {
  const raw = String(user?.name || '').trim();
  const first = raw.split(/\s+/).filter(Boolean)[0] || '';
  return (first || 'Nave').slice(0, 80);
}

function academyCreateBodyFromUser(user, opts) {
  const body = { ai_name: defaultAiNameFromUser(user) };
  if (opts && opts.vertical !== undefined && opts.vertical !== null) {
    body.vertical = String(opts.vertical).trim() === 'physio' ? 'physio' : 'fitness';
  }
  return body;
}

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [sessionChecking, setSessionChecking] = useState(true);
  const [academyReady, setAcademyReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState(false);
  const setAcademyId = useLeadStore((s) => s.setAcademyId);
  const labels = useLeadStore((s) => s.labels);
  const setLabels = useLeadStore((s) => s.setLabels);
  const vertical = useLeadStore((s) => s.vertical);
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
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 1023px)').matches
      : false
  );
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [mobileNavDrawerOpen, setMobileNavDrawerOpen] = useState(false);
  const [novaVendaOpen, setNovaVendaOpen] = useState(false);
  const [nlOpen, setNlOpen] = useState(false);
  const nlPageOverrides = useNlCommandStore((s) => s.pageOverrides);
  const nlContext = useMemo(() => {
    const base = resolveNlContext(location.pathname);
    const pageCtx = nlPageOverrides?.context;
    return pageCtx && ['financeiro', 'funil', 'perfil', 'vendas'].includes(pageCtx) ? pageCtx : base;
  }, [location.pathname, nlPageOverrides?.context]);
  const isActive = (path) => {
    if (path === '/students' || path === '/alunos') {
      return (
        location.pathname === '/students' ||
        location.pathname === '/alunos' ||
        isStudentProfilePath(location.pathname)
      );
    }
    return location.pathname === path;
  };
  const isMaisNavActive = isBottomNavMaisActive(location.pathname);
  const inboxUnread = useLeadStore((s) => s.inboxUnreadConversations);
  const academyIdStore = useLeadStore((s) => s.academyId);
  const academyName = useMemo(() => {
    if (!academyIdStore) return '';
    const current = (academyList || []).find((a) => a.id === academyIdStore);
    return String(current?.name || '').trim();
  }, [academyList, academyIdStore]);

  const billingAccessTop = useLeadStore((s) => s.billingAccess);
  const terms = useTerms();
  /** Menu: em physio, uiLabels pode ainda ter "Alunos" gravado — forçar terminologia da vertical. */
  const navStudentsLabel = vertical === 'physio' ? terms.students : labels.students;
  const newLeadLabel = useMemo(() => getNewLeadLabel(labels.leads), [labels.leads]);

  const topbarTrialChip = useMemo(() => {
    if (!isBillingLive() || billingAccessTop?.status !== 'trial' || !billingAccessTop?.currentPeriodEnd) {
      return null;
    }
    const d = trialDaysRemaining(billingAccessTop.currentPeriodEnd);
    if (d == null) return null;
    const endLabel = new Date(billingAccessTop.currentPeriodEnd).toLocaleDateString('pt-BR');
    return (
      <button
        type="button"
        className="navi-topbar-trial-chip"
        onClick={() => navigate('/conta?tab=assinatura')}
        title={`Trial até ${endLabel}. Clique para ver planos.`}
      >
        Trial: {d} dia{d === 1 ? '' : 's'}
      </button>
    );
  }, [billingAccessTop, navigate]);

  const isInboxPath = location.pathname === '/inbox';

  const academyDocForRole = useMemo(() => {
    if (!academyIdStore) return null;
    const a = academyList.find((x) => x.id === academyIdStore);
    if (!a) return null;
    return { ownerId: String(a.ownerId || ''), teamId: String(a.teamId || '') };
  }, [academyList, academyIdStore]);

  const navRole = useUserRole(academyDocForRole);
  const canConfigureAgenteIa = navRole === 'owner' || navRole === 'member';

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => {
      const next = mq.matches;
      setIsMobileViewport(next);
      if (!next) {
        setMobileMoreOpen(false);
        setMobileNavDrawerOpen(false);
      }
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setMobileMoreOpen(false);
    setMobileNavDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onNavPush = (e) => {
      const path = String(e?.detail || '').trim();
      if (path) navigate(path);
    };
    window.addEventListener(NAV_PUSH_EVENT, onNavPush);
    return () => window.removeEventListener(NAV_PUSH_EVENT, onNavPush);
  }, [navigate]);

  useEffect(() => {
    if (!mobileMoreOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMoreOpen]);

  const bootstrapAbortRef = React.useRef(null);

  const cancelBootstrap = React.useCallback(() => {
    bootstrapAbortRef.current?.abort();
    bootstrapAbortRef.current = null;
    cancelFetchLeads();
    cancelFetchStudents();
  }, []);

  const mobileMoreItems = useMemo(
    () =>
      buildMobileMoreItems({
        modules: academyReady ? modules : { sales: false, inventory: false, finance: false },
        isOwner: navRole === 'owner',
        pipelineLabel: labels.pipeline || 'Funil',
      }),
    [academyReady, modules, navRole, labels.pipeline]
  );

  const closeMobileMore = () => setMobileMoreOpen(false);
  const closeMobileNavDrawer = () => setMobileNavDrawerOpen(false);

  const mobileDrawerSections = useMemo(
    () =>
      buildMobileDrawerSections({
        modules: academyReady ? modules : { sales: false, inventory: false, finance: false },
        canConfigureAgenteIa,
        pipelineLabel: labels.pipeline || 'Funil',
        navStudentsLabel,
        newLeadLabel,
        isOwner: navRole === 'owner',
      }),
    [
      academyReady,
      modules,
      canConfigureAgenteIa,
      labels.pipeline,
      navStudentsLabel,
      newLeadLabel,
      navRole,
    ]
  );

  useEffect(() => {
    const onOpenNovaVenda = () => setNovaVendaOpen(true);
    window.addEventListener(OPEN_NOVA_VENDA_MODAL_EVENT, onOpenNovaVenda);
    return () => window.removeEventListener(OPEN_NOVA_VENDA_MODAL_EVENT, onOpenNovaVenda);
  }, []);

  const sideLinkClass = ({ isActive: navIsActive }) =>
    `navi-sidebar-link${navIsActive ? ' active navi-sidebar-link--active' : ''}`;

  const handleAcademyChange = React.useCallback(
    async (id) => {
      if (!id) return;
      cancelBootstrap();
      const ac = new AbortController();
      bootstrapAbortRef.current = ac;
      const { signal } = ac;

      setAcademyId(id);
      useStudentStore.getState().resetForAcademyChange();
      useLeadStore.getState().setDataReady(false);
      useLeadStore.getState().setInboxUnreadConversations(0);
      localStorage.setItem('activeAcademyId', id);
      useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      try {
        const doc = await getAcademyDocument(id);
        if (signal.aborted) return;
        applyAcademyDocToLeadStore(doc, { setLabels, setModules });
      } catch (e) {
        void e;
        if (signal.aborted) return;
        useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      }
      await Promise.all([
        useLeadStore.getState().fetchLeads({ signal }),
        useStudentStore.getState().fetchStudents({ signal }),
      ]);
      if (signal.aborted) return;
      const financeEnabled = Boolean(useLeadStore.getState().modules?.finance);
      if (financeEnabled) void prefetchFinanceConfig(id);
      await syncBilling(id);
      if (!signal.aborted) useLeadStore.getState().setDataReady(true);
    },
    [setAcademyId, setLabels, setModules, cancelBootstrap]
  );

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
      const onAssinatura =
        location.pathname === '/planos' ||
        (location.pathname === '/conta' && new URLSearchParams(location.search).get('tab') === 'assinatura');
      if (!data?.sucesso || !data.needsPlan || onAssinatura) return;
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
              'Quando o trial acabar, será preciso ativar a assinatura do Nave. Abra Conta → Assinatura quando quiser configurar.',
            duration: 9000,
          });
        } catch {
          void 0;
        }
        return;
      }
      navigate('/conta?tab=assinatura');
    },
    [location.pathname, location.search, navigate]
  );

  useEffect(() => {
    if (!user || !academyIdStore || !academyReady || !isBillingLive()) {
      if (!academyReady) return undefined;
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
  }, [user, academyIdStore, academyReady, location.pathname, applyBillingNeedsPlanNudge]);

  useEffect(() => {
    if (!user || !academyIdStore) {
      useLeadStore.getState().setInboxUnreadConversations(0);
      return undefined;
    }
    let cancelled = false;
    let timer = null;

    const syncInboxUnreadBadge = async () => {
      try {
        const jwt = await createSessionJwt();
        if (!jwt || cancelled) return;
        const resp = await fetch('/api/conversations?stats=1', {
          headers: {
            Authorization: `Bearer ${jwt}`,
            'x-academy-id': String(academyIdStore || '')
          }
        });
        const data = await resp.json().catch(() => ({}));
        if (cancelled) return;
        if (!resp.ok) return;
        const n = Number(data?.unread_conversations);
        if (Number.isFinite(n)) {
          useLeadStore.getState().setInboxUnreadConversations(Math.max(0, Math.floor(n)));
        }
      } catch {
        void 0;
      }
    };

    const onFocus = () => {
      void syncInboxUnreadBadge();
    };

    const startTimer = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => {
        void syncInboxUnreadBadge();
      }, 60000);
    };

    const onVisibility = () => {
      if (typeof document === 'undefined') return;
      if (document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      void syncInboxUnreadBadge();
      startTimer();
    };

    if (typeof document !== 'undefined' && !document.hidden) {
      void syncInboxUnreadBadge();
      startTimer();
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility);
      }
    };
  }, [user, academyIdStore]);

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
          setAcademyReady(false);
          useLeadStore.getState().setDataReady(false);
          setBootstrapError(false);
          try { useLeadStore.getState().setUserId(currentUser.$id); } catch (e) { void e; }
          try { await authService.refreshJwt(); } catch (e) { void e; }
          cancelBootstrap();
          const ac = new AbortController();
          bootstrapAbortRef.current = ac;
          try {
            await setupAcademyPhase1(currentUser, ac.signal);
            if (ac.signal.aborted) return;
            setAcademyReady(true);
            setSessionChecking(false);
            void setupAcademyPhase2(currentUser, ac.signal);
          } catch (e) {
            if (!ac.signal.aborted) {
              console.error('Bootstrap fase 1:', e);
              setBootstrapError(true);
            }
            setSessionChecking(false);
          }
          try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) { void e; }
          const path = window.location.pathname;
          const search = window.location.search || '';
          const landingPaths = ['/', '/login', '/register', '/cadastro'];
          const publicEnrollmentPath = path.startsWith('/inscricao/');
          if (landingPaths.includes(path) && !publicEnrollmentPath) {
            navigate('/', { replace: true });
          } else if (!publicEnrollmentPath) {
            navigate(`${path}${search}`, { replace: true });
          }
        } else {
          const p = window.location.pathname;
          const authPaths = ['/login', '/register', '/cadastro'];
          const publicEnrollmentPath = p.startsWith('/inscricao/');
          if (!authPaths.includes(p) && !publicEnrollmentPath) {
            navigate('/', { replace: true });
          }
          setSessionChecking(false);
        }
      } catch {
        const p = window.location.pathname;
        const authPaths = ['/login', '/register', '/cadastro'];
        const publicEnrollmentPath = p.startsWith('/inscricao/');
        if (!authPaths.includes(p) && !publicEnrollmentPath) {
          navigate('/', { replace: true });
        }
        setSessionChecking(false);
      }
    };
    init();
  }, []);

  const migrateCustomLeadQuestionsIfNeeded = async (doc, academyId) => {
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
          customLeadQuestions: JSON.stringify(list),
        }).catch((e) => {
          console.warn('[setupAcademy] Failed to update customLeadQuestions:', e);
        });
        doc.customLeadQuestions = JSON.stringify(list);
      }
    } catch (e) {
      void e;
    }
  };

  /** Fase 1: conta, lista de academias, documento e módulos (bloqueia shell). */
  const setupAcademyPhase1 = async (u, signal, opts) => {
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
        email: String(d?.email || '').trim(),
      }));
      setAcademyList(mappedAcademies);
      try {
        useLeadStore.getState().setAcademyList(mappedAcademies);
      } catch (e) {
        void e;
      }
      try {
        void cleanOldAccountingCache(mappedAcademies.map((a) => a.id));
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
          body: JSON.stringify(academyCreateBodyFromUser(u, opts))
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
      if (signal?.aborted) return academyId;
      setAcademyId(academyId);
      localStorage.setItem('activeAcademyId', academyId);
      useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      try {
        const doc = await getAcademyDocument(academyId);
        if (signal?.aborted) return academyId;
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
        await migrateCustomLeadQuestionsIfNeeded(doc, academyId);
        if (signal?.aborted) return academyId;
        applyAcademyDocToLeadStore(doc, { setLabels, setModules });
        if (needsSingletonAcademyList && doc) {
          const single = [
            {
              id: academyId,
              name: doc.name || academyId,
              ownerId: String(doc.ownerId || u.$id || ''),
              teamId: String(doc.teamId || ''),
              email: String(doc.email || '').trim(),
            },
          ];
          setAcademyList(single);
          try {
            useLeadStore.getState().setAcademyList(single);
          } catch (e2) {
            void e2;
          }
          try {
            void cleanOldAccountingCache(single.map((a) => a.id));
          } catch (e3) {
            void e3;
          }
        }
      } catch (e) {
        void e;
        if (signal?.aborted) return academyId;
        useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      }
      useLeadStore.getState().setAcademyId(academyId);
      return academyId;
    } catch (e) {
      console.error('Erro ao carregar academia:', e);
      try {
        useUiStore.getState().addToast({
          type: 'error',
          message: `Não foi possível carregar sua ${terms.workspaceNoun}. Tente novamente ou entre em contato com o administrador.`,
          duration: 6000,
        });
      } catch (toastErr) {
        console.error(toastErr);
      }
      throw e;
    }
  };

  /** Fase 2: leads, alunos, finance config e billing (background). */
  const setupAcademyPhase2 = async (u, signal) => {
    const academyId = useLeadStore.getState().academyId;
    if (!academyId || signal?.aborted) return;
    try {
      const financeEnabled = Boolean(useLeadStore.getState().modules?.finance);
      await Promise.all([
        useLeadStore.getState().fetchLeads({ signal }),
        useStudentStore.getState().fetchStudents({ signal }),
      ]);
      if (signal?.aborted) return;
      if (financeEnabled) void prefetchFinanceConfig(academyId);
      await syncBilling(academyId);
      if (!signal?.aborted) useLeadStore.getState().setDataReady(true);
    } catch (e) {
      if (!signal?.aborted) {
        console.error('Bootstrap fase 2:', e);
        try {
          useUiStore.getState().addToast({
            type: 'warning',
            message: 'Alguns dados não carregaram. Recarregue a página se as listas estiverem vazias.',
            duration: 8000,
          });
        } catch {
          void 0;
        }
        useLeadStore.getState().setDataReady(true);
      }
    }
  };

  const handleLogin = async (u, opts) => {
    if (!u || !u.$id) {
      navigate('/login', { replace: true });
      return;
    }
    setUser(u);
    setAcademyReady(false);
    useLeadStore.getState().setDataReady(false);
    try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
    try { await authService.refreshJwt(); } catch (e) { void e; }
    cancelBootstrap();
    const ac = new AbortController();
    bootstrapAbortRef.current = ac;
    await setupAcademyPhase1(u, ac.signal, opts);
    if (ac.signal.aborted) return;
    setAcademyReady(true);
    void setupAcademyPhase2(u, ac.signal);
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
    cancelBootstrap();
    setAcademyReady(false);
    useLeadStore.getState().setDataReady(false);
    useLeadStore.getState().setAcademyId(null);
    useLeadStore.getState().setAcademyList([]);
    useLeadStore.getState().setInboxUnreadConversations(0);
    useLeadStore.setState({ leads: [] });
  };

  if (bootstrapError) {
    return (
      <>
        <OfflineBanner />
        <div
        className="app-container"
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '2rem 1rem',
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 520, width: '100%' }}>
          <ErrorBanner
            message="Não foi possível carregar sua academia. Verifique sua conexão e tente novamente."
            onRetry={() => window.location.reload()}
          />
        </div>
        <button
          type="button"
          className="btn-outline"
          onClick={() => void handleLogout()}
          style={{ minWidth: 160 }}
        >
          Sair da conta
        </button>
      </div>
      </>
    );
  }

  if (sessionChecking) {
    return (
      <>
        <OfflineBanner />
        <div className="navi-bootstrap-loader" role="status" aria-live="polite" aria-label="Iniciando">
        <div className="navi-bootstrap-loader__brand">
          <NaviBrandLockup height={36} variant="dark" />
        </div>
        <div className="navi-bootstrap-loader__track" aria-hidden>
          <div className="navi-bootstrap-loader__bar" />
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
          .navi-bootstrap-loader {
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 24px;
            padding: 32px 24px;
            background: var(--navi-brand-img-bg-dark);
          }
          .navi-bootstrap-loader__brand {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 14px;
            animation: naviBootstrapPulse 2s ease-in-out infinite;
          }
          @keyframes naviBootstrapPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
          .navi-bootstrap-loader__track {
            width: min(220px, 72vw);
            height: 3px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.12);
            overflow: hidden;
          }
          .navi-bootstrap-loader__bar {
            height: 100%;
            width: 0%;
            border-radius: inherit;
            background: var(--v500);
            animation: naviBootstrapProgress 2s ease-in-out infinite;
          }
          @keyframes naviBootstrapProgress {
            0% { width: 0%; margin-left: 0; }
            50% { width: 72%; margin-left: 14%; }
            100% { width: 100%; margin-left: 0; }
          }
          @media (prefers-reduced-motion: reduce) {
            .navi-bootstrap-loader__brand { animation: none; opacity: 1; }
            .navi-bootstrap-loader__bar { width: 100%; animation: none; }
          }
        `}} />
      </div>
      </>
    );
  }

  if (/^\/inscricao\/[^/]+/.test(location.pathname)) {
    return (
      <>
        <OfflineBanner />
        <NaviToasts />
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/inscricao/:token" element={<PublicStudentEnrollment />} />
          </Routes>
        </Suspense>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <OfflineBanner />
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
      </>
    );
  }

  return (
    <>
    <OfflineBanner />
    <ErrorBoundary>
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
                  <NaviBrandLockup height={72} variant="dark" className="navi-brand-lockup--sidebar" />
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
                  <NaviLogo size={48} variant="white" />
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

          <NaviSidebarNav
            collapsed={sidebarCollapsed}
            sideLinkClass={sideLinkClass}
            labels={labels}
            navStudentsLabel={navStudentsLabel}
            newLeadLabel={newLeadLabel}
            modules={modules}
            modulesReady={academyReady}
            navRole={navRole}
            canConfigureAgenteIa={canConfigureAgenteIa}
            inboxUnread={inboxUnread}
          />
        </aside>

        <div className="navi-main-stack">
          <header className="navi-topbar">
            {isMobileViewport ? (
              <button
                type="button"
                className="navi-topbar-menu-btn"
                onClick={() => setMobileNavDrawerOpen(true)}
                aria-expanded={mobileNavDrawerOpen}
                aria-controls="navi-mobile-nav-drawer"
                aria-label="Abrir menu"
                title="Menu"
              >
                <Grid2x2 size={22} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <div className="navi-topbar-spacer" aria-hidden="true" />
            {academyReady && academyIdStore ? (
              <div className="navi-topbar-search">
                <NlCommandBarTrigger onClick={() => setNlOpen(true)} />
              </div>
            ) : null}
            <div className="navi-topbar-actions">
              {topbarTrialChip}
              <NotificationBell academyId={academyIdStore} userId={user?.$id} />
              <NaviUserMenu
                user={user}
                onLogout={handleLogout}
                myWorkspaceLabel={terms.myWorkspace}
                academyList={academyList}
                academyId={academyIdStore}
                academyName={academyName}
                onAcademyChange={handleAcademyChange}
              />
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
            {(() => {
              const bootstrapPaths = ['/empresa', '/conta', '/equipe', '/integracoes'];
              const showRoutesWhileBootstrap =
                academyReady || bootstrapPaths.includes(location.pathname);
              if (!showRoutesWhileBootstrap) {
                return <PageSkeleton variant="cards" />;
              }
              return (
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/login" element={<Navigate to="/" replace />} />
                  <Route path="/register" element={<Navigate to="/" replace />} />
                  <Route path="/cadastro" element={<Navigate to="/" replace />} />
                  <Route path="/pipeline" element={<Pipeline />} />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/agente-ia" element={<AIAgentSettings />} />
                  <Route path="/lead/:id" element={<LeadProfile />} />
                  <Route path="/student/:id" element={<StudentProfile />} />
                  <Route path="/new-lead" element={<NewLead />} />
                  <Route path="/reports" element={<Reports />} />
                  {modules.finance === true && <Route path="/financeiro" element={<Caixa />} />}
                  {modules.finance === true && <Route path="/caixa" element={<CaixaRedirect />} />}
                  {modules.finance === true && <Route path="/finance" element={<FinanceRedirect />} />}
                  {modules.finance === true && (
                    <Route path="/mensalidades" element={<MensalidadesRedirect />} />
                  )}
                  <Route path="/contratos" element={<ContratosRedirect />} />
                  <Route path="/contratos/modelos" element={<ContratosModelosRedirect />} />
                  {(modules.inventory === true || modules.sales === true) && (
                    <Route path="/loja" element={<Loja />} />
                  )}
                  {modules.inventory === true && <Route path="/estoque" element={<LojaTabRedirect tab="estoque" />} />}
                  {(modules.inventory === true || modules.sales === true) && (
                    <Route path="/produtos" element={<LojaTabRedirect tab="produtos" />} />
                  )}
                  {modules.sales === true && <Route path="/vendas" element={<LojaTabRedirect tab="vendas" />} />}
                  <Route
                    path="/alunos"
                    element={
                      <Suspense fallback={<PageSkeleton variant="table" rows={6} columns={6} />}>
                        <Alunos />
                      </Suspense>
                    }
                  />
                  <Route
                    path="/students"
                    element={
                      <Suspense fallback={<PageSkeleton variant="table" rows={6} columns={6} />}>
                        <Alunos />
                      </Suspense>
                    }
                  />
                  <Route path="/tarefas" element={<Tasks />} />
                  <Route path="/conta" element={<UserAccount user={user} onLogout={handleLogout} />} />
                  <Route path="/planos" element={<PlanosRedirect />} />
                  <Route path="/empresa" element={<AcademySettings />} />
                  <Route path="/equipe" element={<Equipe />} />
                  <Route path="/integracoes" element={<Integracoes />} />
                  <Route path="/presenca" element={<Attendance />} />
                  <Route path="/recepcao" element={<Recepcao />} />
                  <Route path="/profile" element={<Navigate to="/conta" replace />} />
                  <Route path="/automacoes" element={<Automacoes />} />
                  <Route path="/templates" element={<TemplatesRedirect />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
              );
            })()}
          </main>
        </div>
      </div>

      {isMobileViewport ? (
        <>
          <NaviMobileDrawer
            open={mobileNavDrawerOpen}
            onClose={closeMobileNavDrawer}
            sections={mobileDrawerSections}
            newLeadLabel={newLeadLabel}
          />
          <NaviMobileMoreSheet open={mobileMoreOpen} onClose={closeMobileMore} items={mobileMoreItems} />
        </>
      ) : null}

      <NovaVendaModal open={novaVendaOpen} onClose={() => setNovaVendaOpen(false)} />
      {academyReady && academyIdStore ? (
        <NlCommandBar
          open={nlOpen}
          onOpenChange={setNlOpen}
          academyName={academyName}
          context={nlContext}
          pipelineStages={nlPageOverrides.pipelineStages}
          pendingTransactions={nlPageOverrides.pendingTransactions}
          recentPayments={nlPageOverrides.recentPayments}
        />
      ) : null}

      <nav className="navi-bottom-nav" aria-label="Navegação">
        <Link to="/" className={`navi-nav-item${isActive('/') ? ' active' : ''}`}>
          <LayoutGrid size={22} strokeWidth={1.75} />
          <span>Hoje</span>
        </Link>
        <Link to="/inbox" className={`navi-nav-item${isInboxPath ? ' active' : ''}`}>
          <MessageCircle size={22} strokeWidth={1.75} />
          {inboxUnread > 0 && (
            <span className="navi-inbox-unread-dot" title={`${inboxUnread} conversa(s) com mensagens não lidas`} aria-hidden />
          )}
          <span>Conversas</span>
        </Link>
        <Link to="/new-lead" className="navi-nav-item navi-nav-fab" aria-label={newLeadLabel}>
          <div className="navi-fab-btn">
            <PlusCircle size={28} strokeWidth={1.75} />
          </div>
        </Link>
        <Link to="/students" className={`navi-nav-item${isActive('/students') ? ' active' : ''}`}>
          <GraduationCap size={22} strokeWidth={1.75} />
          <span>{navStudentsLabel}</span>
        </Link>
        <button
          type="button"
          className={`navi-nav-item navi-nav-item--mais${mobileMoreOpen || isMaisNavActive ? ' active' : ''}`}
          onClick={() => setMobileMoreOpen(true)}
          aria-expanded={mobileMoreOpen}
          aria-controls="navi-mobile-more-panel"
          aria-label="Mais opções"
        >
          <Grid2x2 size={22} strokeWidth={1.75} aria-hidden />
          <span>Mais</span>
        </button>
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
          .navi-topbar-spacer {
            flex: 1 1 auto;
            min-width: 0;
          }
          .navi-topbar-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            flex-wrap: nowrap;
            flex-shrink: 0;
            gap: 10px;
            min-width: 0;
          }
          .navi-topbar-academy-name {
            font-size: 12px;
            font-weight: 500;
            color: rgba(255,255,255,0.7);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 34vw;
          }
          .navi-topbar-logout {
            background: transparent;
            color: rgba(255,255,255,0.75);
            border: none;
            border-radius: 8px;
            width: 32px;
            height: 32px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            cursor: pointer;
            min-height: 32px;
            transition: background 0.15s ease, color 0.15s ease;
          }
          .navi-topbar-logout:hover {
            background: rgba(255,255,255,0.1);
            color: rgba(255,255,255,0.95);
          }
        `}} />
    </div>
    </ErrorBoundary>
    </>
  );
};

export default App;

