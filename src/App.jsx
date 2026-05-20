import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { Routes, Route, Link, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  LayoutGrid,
  PlusCircle,
  ShoppingBag,
  Boxes,
  Package,
  BarChart3,
  MessageCircle,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Kanban,
  GraduationCap,
  Bot,
  FileText,
  FileSignature,
  Wallet,
  Users,
  CheckSquare,
  Menu,
  Store,
  X
} from 'lucide-react';
import { authService } from './lib/auth';
import { databases, DB_ID, ACADEMIES_COL, STOCK_ITEMS_COL, INVENTORY_MOVE_FN_ID, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID, LEADS_COL, createSessionJwt, teams } from './lib/appwrite';
import { isBillingLive } from './lib/billingEnabled';
import { Query } from 'appwrite';
import { useLeadStore } from './store/useLeadStore';
import { useStudentStore } from './store/useStudentStore';
import { cleanOldAccountingCache } from './store/useAccountingStore';
import { useUiStore } from './store/useUiStore';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import LeadProfile from './pages/LeadProfile';
import StudentProfile from './pages/StudentProfile';
import NewLead from './pages/NewLead';
import Students from './pages/Students';
import Tasks from './pages/Tasks';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';
import { prefetchFinanceConfig } from './lib/prefetchFinanceConfig.js';
import NaviUserMenu from './components/layout/NaviUserMenu.jsx';
import { PlanosRedirect, FinanceRedirect, ContratosModelosRedirect, LojaTabRedirect } from './components/routing/LegacyRedirects.jsx';

const Inbox = React.lazy(() => import('./pages/Inbox'));
const Reports = React.lazy(() => import('./pages/Reports'));
const AIAgentSettings = React.lazy(() => import('./pages/AIAgentSettings'));
const UserAccount = React.lazy(() => import('./pages/UserAccount'));
const AcademySettings = React.lazy(() => import('./pages/AcademySettings'));
const Templates = React.lazy(() => import('./pages/Templates'));
const Mensalidades = React.lazy(() => import('./pages/Mensalidades'));
const Caixa = React.lazy(() => import('./pages/Caixa'));
const Inventory = React.lazy(() => import('./pages/Inventory'));
const Products = React.lazy(() => import('./pages/Products'));
const Sales = React.lazy(() => import('./pages/Sales'));
const Loja = React.lazy(() => import('./pages/Loja'));
const Contratos = React.lazy(() => import('./pages/Contratos'));
import NaviLogo from './components/NaviLogo.jsx';
import NaviWordmark from './components/NaviWordmark.jsx';
import NaviToasts from './components/NaviToasts.jsx';
import OnboardingBanner from './components/OnboardingBanner.jsx';
import { useUserRole } from './lib/useUserRole';
import { parseOnboardingChecklist, trialDaysRemaining } from './lib/onboardingChecklist.js';
import NotificationBell from './components/layout/NotificationBell.jsx';
import { useTerms } from './lib/terminology.js';
import { getNewLeadLabel, buildMobileDrawerSections } from './lib/naviMenu.js';
import NaviSidebarNav from './components/layout/NaviSidebarNav.jsx';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isActive = (path) => location.pathname === path;
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

  const isAgenteIaPage = location.pathname === '/agente-ia';
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => {
      const next = mq.matches;
      setIsMobileViewport(next);
      if (!next) setMobileMenuOpen(false);
    };
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  const bootModules = useMemo(
    () => (academyReady ? modules : { sales: true, inventory: true, finance: true }),
    [academyReady, modules]
  );

  const mobileMenuSections = useMemo(
    () =>
      buildMobileDrawerSections({
        modules: bootModules,
        navRole,
        canConfigureAgenteIa,
        pipelineLabel: labels.pipeline || 'Funil',
      }),
    [bootModules, navRole, canConfigureAgenteIa, labels.pipeline]
  );

  const mobileDrawerIconMap = useMemo(
    () => ({
      pipeline: Kanban,
      tarefas: CheckSquare,
      templates: FileText,
      agente: Bot,
      mensalidades: Users,
      contratos: FileSignature,
      caixa: Wallet,
      loja: Store,
      reports: BarChart3,
    }),
    []
  );

  const closeMobileDrawer = () => setMobileMenuOpen(false);

  const sideLinkClass = ({ isActive: navIsActive }) =>
    `navi-side-link${navIsActive ? ' active navi-side-link--active' : ''}`;

  const handleAcademyChange = React.useCallback(
    async (id) => {
      if (!id) return;
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
        } catch {
          uiLabels = null;
          mods = null;
        }
        const labelVerticalSwitch = String(doc.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
        if (uiLabels && typeof uiLabels === 'object') {
          setLabels({
            leads: uiLabels.leads || (labelVerticalSwitch === 'physio' ? 'Pacientes' : 'Leads'),
            students: uiLabels.students || (labelVerticalSwitch === 'physio' ? 'Pacientes' : 'Alunos'),
            classes: uiLabels.classes || (labelVerticalSwitch === 'physio' ? 'Atendimentos' : 'Aulas'),
            pipeline: uiLabels.pipeline || 'Funil',
          });
        }
        try {
          useLeadStore.getState().setVertical(doc.vertical || 'fitness');
        } catch (e2) {
          void e2;
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
      await Promise.all([
        useLeadStore.getState().fetchLeads(),
        useStudentStore.getState().fetchStudents(),
      ]);
    },
    [setAcademyId, setLabels, setModules]
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
              'Quando o trial acabar, será preciso escolher um plano. Abra Planos ou Conta → Assinatura quando quiser configurar.',
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

    void syncInboxUnreadBadge();
    timer = setInterval(() => {
      void syncInboxUnreadBadge();
    }, 20000);
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus);
    }
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', onFocus);
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
          try { useLeadStore.getState().setUserId(currentUser.$id); } catch (e) { void e; }
          try { await authService.refreshJwt(); } catch (e) { void e; }
          setSessionChecking(false);
          void setupAcademy(currentUser).finally(() => setAcademyReady(true));
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
        setSessionChecking(false);
      }
    };
    init();
  }, []);

  // Create or find academy for user (opts.vertical só no cadastro: primeiro POST /api/academies/create)
  const setupAcademy = async (u, opts) => {
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
        const labelVertical = String(doc.vertical || '').trim() === 'physio' ? 'physio' : 'fitness';
        if (uiLabels && typeof uiLabels === 'object') {
          setLabels({
            leads: uiLabels.leads || (labelVertical === 'physio' ? 'Pacientes' : 'Leads'),
            students: uiLabels.students || (labelVertical === 'physio' ? 'Pacientes' : 'Alunos'),
            classes: uiLabels.classes || (labelVertical === 'physio' ? 'Atendimentos' : 'Aulas'),
            pipeline: uiLabels.pipeline || 'Funil',
          });
        }
        try {
          useLeadStore.getState().setVertical(doc.vertical || 'fitness');
        } catch (e) {
          void e;
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
          try {
            void cleanOldAccountingCache(single.map((a) => a.id));
          } catch (e3) {
            void e3;
          }
        }
      } catch (e) {
        void e;
        useLeadStore.getState().setOnboardingChecklist(parseOnboardingChecklist(null));
      }
      // Fetch leads after academy is set
      useLeadStore.getState().setAcademyId(academyId);
      const financeEnabled = Boolean(useLeadStore.getState().modules?.finance);
      const leadsPromise = useLeadStore.getState().fetchLeads();
      const studentsPromise = useStudentStore.getState().fetchStudents();
      if (financeEnabled && academyId) {
        void prefetchFinanceConfig(academyId);
      }
      await Promise.all([leadsPromise, studentsPromise]);
      await syncBilling(academyId);
    } catch (e) {
      console.error('Erro ao carregar academia:', e);
      // Exibir mensagem clara para o usuário
      // setError('Não foi possível carregar sua academia. Tente novamente ou entre em contato com o administrador.');
      // Como estamos no App.jsx e não temos 'setError' local, usaremos o toast
      try {
        useUiStore.getState().addToast({
          type: 'error',
          message: `Não foi possível carregar sua ${terms.workspaceNoun}. Tente novamente ou entre em contato com o administrador.`,
          duration: 6000
        });
      } catch (toastErr) {
        console.error(toastErr);
      }
      // NÃO fazer logout automático
    }
  };

  const handleLogin = async (u, opts) => {
    if (!u || !u.$id) {
      navigate('/login', { replace: true });
      return;
    }
    setUser(u);
    setAcademyReady(false);
    try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
    try { await authService.refreshJwt(); } catch (e) { void e; }
    await setupAcademy(u, opts);
    setAcademyReady(true);
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
    setAcademyReady(false);
    useLeadStore.getState().setAcademyId(null);
    useLeadStore.getState().setAcademyList([]);
    useLeadStore.getState().setInboxUnreadConversations(0);
    useLeadStore.setState({ leads: [] });
  };

  if (sessionChecking) {
    return (
      <div className="navi-bootstrap-loader" role="status" aria-live="polite" aria-label="Iniciando">
        <div className="navi-bootstrap-loader__brand">
          <NaviLogo size={48} variant="white" />
          <NaviWordmark fontSize={20} variant="light" />
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
            background: var(--v900);
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

  return (
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

          <NaviSidebarNav
            collapsed={sidebarCollapsed}
            sideLinkClass={sideLinkClass}
            labels={labels}
            navStudentsLabel={navStudentsLabel}
            newLeadLabel={newLeadLabel}
            modules={bootModules}
            navRole={navRole}
            canConfigureAgenteIa={canConfigureAgenteIa}
            isInboxConversasNavActive={isInboxConversasNavActive}
            isAgenteIaPage={isAgenteIaPage}
            inboxUnread={inboxUnread}
          />
        </aside>

        <div className="navi-main-stack">
          <header className="navi-topbar">
            {isMobileViewport ? (
              <button
                type="button"
                className="navi-topbar-menu-btn"
                onClick={() => setMobileMenuOpen(true)}
                aria-expanded={mobileMenuOpen}
                aria-controls="navi-mobile-drawer-panel"
                aria-label="Abrir menu"
                title="Menu"
              >
                <Menu size={22} strokeWidth={2} aria-hidden />
              </button>
            ) : null}
            <div className="navi-topbar-spacer" aria-hidden="true" />
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
            {!academyReady ? (
              <PageSkeleton variant="cards" />
            ) : (
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
                  {modules.finance === true && <Route path="/caixa" element={<Caixa />} />}
                  {modules.finance === true && <Route path="/finance" element={<FinanceRedirect />} />}
                  {modules.finance === true && <Route path="/mensalidades" element={<Mensalidades />} />}
                  {modules.finance === true && (
                    <Route
                      path="/contratos"
                      element={
                        <Suspense fallback={<PageSkeleton variant="table" rows={6} columns={6} />}>
                          <Contratos />
                        </Suspense>
                      }
                    />
                  )}
                  {modules.finance === true && (
                    <Route path="/contratos/modelos" element={<ContratosModelosRedirect />} />
                  )}
                  {(modules.inventory === true || modules.sales === true) && (
                    <Route path="/loja" element={<Loja />} />
                  )}
                  {modules.inventory === true && <Route path="/estoque" element={<LojaTabRedirect tab="estoque" />} />}
                  {(modules.inventory === true || modules.sales === true) && (
                    <Route path="/produtos" element={<LojaTabRedirect tab="produtos" />} />
                  )}
                  {modules.sales === true && <Route path="/vendas" element={<LojaTabRedirect tab="vendas" />} />}
                  <Route path="/students" element={<Students />} />
                  <Route path="/tarefas" element={<Tasks />} />
                  <Route path="/conta" element={<UserAccount user={user} onLogout={handleLogout} />} />
                  <Route path="/planos" element={<PlanosRedirect />} />
                  <Route path="/empresa" element={<AcademySettings />} />
                  <Route path="/profile" element={<Navigate to="/conta" replace />} />
                  <Route path="/templates" element={<Templates />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            )}
          </main>
        </div>
      </div>

      {isMobileViewport ? (
        <div
          className={`navi-mobile-drawer${mobileMenuOpen ? ' navi-mobile-drawer--open' : ''}`}
          aria-hidden={!mobileMenuOpen}
        >
          <div
            className="navi-mobile-drawer__backdrop"
            onClick={closeMobileDrawer}
            role="presentation"
            aria-hidden="true"
          />
          <aside
            id="navi-mobile-drawer-panel"
            className="navi-mobile-drawer__panel"
            role="dialog"
            aria-modal="true"
            aria-label="Menu do aplicativo"
            inert={!mobileMenuOpen}
          >
            <div className="navi-mobile-drawer__panel-inner">
              <div className="navi-mobile-drawer__head">
                <span className="navi-mobile-drawer__head-title">Menu</span>
                <button
                  type="button"
                  className="navi-mobile-drawer__close"
                  onClick={closeMobileDrawer}
                  aria-label="Fechar"
                >
                  <X size={22} strokeWidth={2} aria-hidden />
                </button>
              </div>
              <nav className="navi-mobile-drawer__nav" aria-label="Rotas adicionais">
                {mobileMenuSections.map((sec, secIdx) => (
                  <div key={sec.title || `sec-${secIdx}`} className="navi-mobile-drawer__section">
                    {sec.title ? (
                      <div className="navi-mobile-drawer__section-title">{sec.title}</div>
                    ) : null}
                    {sec.items.map((item) => {
                      const Icon = mobileDrawerIconMap[item.iconKey] || LayoutGrid;
                      const active =
                        location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
                      return (
                        <Link
                          key={item.to}
                          to={item.to}
                          className={`navi-mobile-drawer__link${active ? ' navi-mobile-drawer__link--active' : ''}`}
                          onClick={closeMobileDrawer}
                        >
                          <Icon size={20} strokeWidth={1.75} aria-hidden />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                ))}
              </nav>
            </div>
          </aside>
        </div>
      ) : null}

      <nav className="navi-bottom-nav" aria-label="Navegação">
        <Link to="/" className={`navi-nav-item${isActive('/') ? ' active' : ''}`}>
          <LayoutGrid size={22} strokeWidth={1.75} />
          <span>Início</span>
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
        {bootModules.finance === true ? (
          <Link to="/mensalidades" className={`navi-nav-item${isActive('/mensalidades') ? ' active' : ''}`}>
            <Users size={22} strokeWidth={1.75} />
            <span>Mensalidades</span>
          </Link>
        ) : (
          <Link to="/tarefas" className={`navi-nav-item${isActive('/tarefas') ? ' active' : ''}`}>
            <CheckSquare size={22} strokeWidth={1.75} />
            <span>Tarefas</span>
          </Link>
        )}
        <button
          type="button"
          className={`navi-nav-item navi-nav-item--menu${mobileMenuOpen ? ' active' : ''}`}
          onClick={() => setMobileMenuOpen(true)}
          aria-expanded={mobileMenuOpen}
          aria-controls="navi-mobile-drawer-panel"
          aria-label="Abrir menu"
        >
          <Menu size={22} strokeWidth={1.75} />
          <span>Menu</span>
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
            flex-wrap: wrap;
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
  );
};

export default App;

