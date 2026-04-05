import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LayoutGrid, Users, PlusCircle, GraduationCap, User, ShoppingBag, Boxes, BarChart3, MessageCircle } from 'lucide-react';
import { authService } from './lib/auth';
import { databases, DB_ID, ACADEMIES_COL, STOCK_ITEMS_COL, INVENTORY_MOVE_FN_ID, SALES_CREATE_FN_ID, SALES_CANCEL_FN_ID, LEADS_COL } from './lib/appwrite';
import { ID, Query, Permission, Role } from 'appwrite';
import { useLeadStore } from './store/useLeadStore';
import { useUiStore } from './store/useUiStore';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import LeadProfile from './pages/LeadProfile';
import NewLead from './pages/NewLead';
import Students from './pages/Students';
import Account from './pages/Account';
import Login from './pages/Login';
import Register from './pages/Register';
import Welcome from './pages/Welcome';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Reports from './pages/Reports';
import Templates from './pages/Templates';
import Inbox from './pages/Inbox';
import NaviLogo from './components/NaviLogo.jsx';

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
  const toasts = useUiStore((s) => s.toasts);
  const removeToast = useUiStore((s) => s.removeToast);
  const leadSingular = (plural) => {
    const base = String(plural || '').trim();
    if (!base) return 'lead';
    const lower = base.toLowerCase();
    return lower.endsWith('s') ? lower.slice(0, -1) : lower;
  };

  const isActive = (path) => location.pathname === path;

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
      const res = await databases.listDocuments(DB_ID, ACADEMIES_COL, [
        Query.equal('ownerId', [u.$id]),
        Query.limit(50),
      ]);
      let academyId = null;
      const list = res.documents || [];
      setAcademyList(list.map(d => ({ id: d.$id, name: d.name || d.$id })));
      const saved = localStorage.getItem('activeAcademyId');
      if (saved && list.find(d => d.$id === saved)) {
        academyId = saved;
      } else if (list.length > 0) {
        academyId = list[0].$id;
      } else {
        const defaultFinance = {
          cardFees: {
            pix: { percent: 0, fixed: 0 },
            debito: { percent: 0, fixed: 0 },
            credito_avista: { percent: 0, fixed: 0 },
            credito_parcelado: { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 0, '11': 0, '12': 0 }
          },
          bankAccounts: [],
          plans: []
        };
        const checklist = [
          { id: 'academy_info', title: 'Atualizar dados da academia', done: false },
          { id: 'ui_labels', title: 'Definir rótulos (Aulas/Alunos/Leads)', done: false },
          { id: 'quick_times', title: 'Adicionar horários rápidos', done: false },
          { id: 'first_lead', title: 'Criar primeiro lead', done: false },
          { id: 'install_pwa', title: 'Instalar atalho no celular', done: false }
        ];
        try {
          const jwt = localStorage.getItem('appwrite_jwt') || '';
          const resp = await fetch('/api/academies/create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${jwt}`
            },
            body: JSON.stringify({})
          });
          const data = await resp.json().catch(() => ({}));
          if (resp.ok && data && data.id) {
            academyId = data.id;
          } else {
            throw new Error(data?.erro || 'Falha ao criar academia');
          }
        } catch {
          const perms = [Permission.read(Role.user(u.$id)), Permission.update(Role.user(u.$id)), Permission.delete(Role.user(u.$id))];
          const doc = await databases.createDocument(
            DB_ID,
            ACADEMIES_COL,
            ID.unique(),
            {
              name: u.name || '',
              phone: '',
              email: u.email || '',
              address: '',
              ownerId: u.$id,
              uiLabels: JSON.stringify({ leads: 'Leads', students: 'Alunos', classes: 'Aulas' }),
              modules: JSON.stringify({ sales: false, inventory: false, finance: false }),
              quickTimes: [],
              financeConfig: JSON.stringify(defaultFinance),
              onboardingChecklist: JSON.stringify(checklist),
              customLeadQuestions: JSON.stringify(['Faixa'])
            },
            perms
          );
          academyId = doc.$id;
        }
      }
      setAcademyId(academyId);
      localStorage.setItem('activeAcademyId', academyId);
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        let ensuredTeamId = String(doc?.teamId || '').trim();
        if (!ensuredTeamId) {
          try {
            const jwt = localStorage.getItem('appwrite_jwt') || '';
            const resp = await fetch('/api/academies/create', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({})
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
        // Ensure default custom question 'Faixa' exists once
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

          if (!list.some((q) => String(q?.label || '').trim() === 'Faixa')) {
            migrated = true;
            list.push({ id: createId(), label: 'Faixa', type: 'text' });
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
      } catch (e) { void e; }
      // Fetch leads after academy is set
      useLeadStore.getState().setAcademyId(academyId);
      await useLeadStore.getState().fetchLeads();
    } catch (e) {
      console.error('setupAcademy error:', e);
      const code = String(e?.code || '');
      const msg = String(e?.message || '');
      try {
        if (code === '401' || /authorized|scopes|unauthorized/i.test(msg)) {
          try {
            // Tentar criar academia via endpoint admin usando JWT do usuário
            const jwt = localStorage.getItem('appwrite_jwt') || '';
            if (jwt) {
              const resp = await fetch('/api/academies/create', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${jwt}`,
                },
                body: JSON.stringify({}),
              });
              const data = await resp.json().catch(() => ({}));
              if (resp.ok && data && data.id) {
                const newId = data.id;
                setAcademyId(newId);
                localStorage.setItem('activeAcademyId', newId);
                try { useLeadStore.getState().setAcademyId(newId); } catch (e2) { void e2; }
                try { await useLeadStore.getState().fetchLeads(); } catch (e3) { void e3; }
                navigate('/', { replace: true });
                return;
              }
            }
          } catch (inner) {
            void inner;
          }
          // Se falhar, efetuar logout e ir para welcome
          await authService.logout();
          setUser(null);
          useLeadStore.getState().setAcademyId(null);
          navigate('/', { replace: true });
        }
      } catch { /* noop */ }
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
    await authService.logout();
    setUser(null);
    useLeadStore.getState().setAcademyId(null);
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
        localStorage.setItem('activeAcademyId', id);
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
        } catch (e) { void e; }
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
        <aside className="navi-rail" aria-label="Atalhos">
          <div className="navi-rail-logo">
            <NaviLogo size={28} variant="white" />
          </div>
          <Link to="/" className={`navi-rail-item ${isActive('/') ? 'active' : ''}`} title="Início"><LayoutGrid size={18} strokeWidth={1.75} /></Link>
          <Link to="/new-lead" className={`navi-rail-item ${isActive('/new-lead') ? 'active' : ''}`} title={`Novo ${leadSingular(labels.leads)}`}><PlusCircle size={18} strokeWidth={1.75} /></Link>
          <Link to="/pipeline" className={`navi-rail-item ${isActive('/pipeline') ? 'active' : ''}`} title={labels.pipeline || 'Funil'}><Users size={18} strokeWidth={1.75} /></Link>
          <Link to="/inbox" className={`navi-rail-item ${isActive('/inbox') ? 'active' : ''}`} title="Atendimento"><MessageCircle size={18} strokeWidth={1.75} /></Link>
          <Link to="/students" className={`navi-rail-item ${isActive('/students') ? 'active' : ''}`} title={labels.students}><GraduationCap size={18} strokeWidth={1.75} /></Link>
          <Link to="/reports" className={`navi-rail-item ${isActive('/reports') ? 'active' : ''}`} title="Relatórios"><BarChart3 size={18} strokeWidth={1.75} /></Link>
          {modules.inventory === true && (
            <Link to="/estoque" className={`navi-rail-item ${isActive('/estoque') ? 'active' : ''}`} title="Estoque"><Boxes size={18} strokeWidth={1.75} /></Link>
          )}
          {modules.sales === true && (
            <Link to="/vendas" className={`navi-rail-item ${isActive('/vendas') ? 'active' : ''}`} title="Vendas"><ShoppingBag size={18} strokeWidth={1.75} /></Link>
          )}
          <Link to="/profile" className={`navi-rail-item ${isActive('/profile') ? 'active' : ''}`} title="Conta"><User size={18} strokeWidth={1.75} /></Link>
          <Link to="/templates" className={`navi-rail-item ${isActive('/templates') ? 'active' : ''}`} title="Templates"><MessageCircle size={18} strokeWidth={1.75} /></Link>
        </aside>

        <aside className="navi-sidebar" aria-label="Menu">
          <div className="navi-side-section">
            <span className="navi-side-section-title">CRM</span>
            <Link to="/" className={`navi-side-link ${isActive('/') ? 'active' : ''}`}>
              <LayoutGrid size={18} strokeWidth={1.75} />
              <span>Início</span>
            </Link>
            <Link to="/new-lead" className="navi-side-link primary">
              <PlusCircle size={18} strokeWidth={1.75} />
              <span>Novo {leadSingular(labels.leads)}</span>
            </Link>
            <Link to="/pipeline" className={`navi-side-link ${isActive('/pipeline') ? 'active' : ''}`}>
              <Users size={18} strokeWidth={1.75} />
              <span>{labels.pipeline || 'Funil'}</span>
            </Link>
            <Link to="/inbox" className={`navi-side-link ${isActive('/inbox') ? 'active' : ''}`}>
              <MessageCircle size={18} strokeWidth={1.75} />
              <span>Atendimento</span>
            </Link>
            <Link to="/students" className={`navi-side-link ${isActive('/students') ? 'active' : ''}`}>
              <GraduationCap size={18} strokeWidth={1.75} />
              <span>{labels.students}</span>
            </Link>
            <Link to="/reports" className={`navi-side-link ${isActive('/reports') ? 'active' : ''}`}>
              <BarChart3 size={18} strokeWidth={1.75} />
              <span>Relatórios</span>
            </Link>
          </div>
          {((modules.inventory === true) || (modules.sales === true)) && (
            <div className="navi-side-section">
              <span className="navi-side-section-title">Operações</span>
              {modules.inventory === true && (
                <Link to="/estoque" className={`navi-side-link ${isActive('/estoque') ? 'active' : ''}`}>
                  <Boxes size={18} strokeWidth={1.75} />
                  <span>Estoque</span>
                </Link>
              )}
              {modules.sales === true && (
                <Link to="/vendas" className={`navi-side-link ${isActive('/vendas') ? 'active' : ''}`}>
                  <ShoppingBag size={18} strokeWidth={1.75} />
                  <span>Vendas</span>
                </Link>
              )}
            </div>
          )}
          <div className="navi-side-section">
            <Link to="/profile" className={`navi-side-link ${isActive('/profile') ? 'active' : ''}`}>
              <User size={18} strokeWidth={1.75} />
              <span>Conta</span>
            </Link>
            <Link to="/templates" className={`navi-side-link ${isActive('/templates') ? 'active' : ''}`}>
              <MessageCircle size={18} strokeWidth={1.75} />
              <span>Templates</span>
            </Link>
          </div>
        </aside>

        <div className="navi-main-stack">
          <header className="navi-topbar">
            <button type="button" className="navi-topbar-brand" onClick={() => navigate('/')}>
              <NaviLogo size={22} variant="white" />
              <span className="navi-wordmark">Navi</span>
            </button>
            <div className="flex items-center gap-4" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/inbox" element={<Inbox />} />
              <Route path="/lead/:id" element={<LeadProfile />} />
              <Route path="/new-lead" element={<NewLead />} />
              <Route path="/reports" element={<Reports />} />
              {modules.inventory === true && <Route path="/estoque" element={<Inventory />} />}
              {modules.sales === true && <Route path="/vendas" element={<Sales />} />}
              <Route path="/students" element={<Students />} />
              <Route path="/profile" element={<Account user={user} onLogout={handleLogout} />} />
              <Route path="/templates" element={<Templates />} />
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
          <Users size={22} strokeWidth={1.75} />
          <span>{labels.pipeline || 'Funil'}</span>
        </Link>
        <Link to="/inbox" className={`navi-nav-item ${isActive('/inbox') ? 'active' : ''}`}>
          <MessageCircle size={22} strokeWidth={1.75} />
          <span>Atendimento</span>
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
        <Link to="/profile" className={`navi-nav-item ${isActive('/profile') ? 'active' : ''}`}>
          <User size={22} strokeWidth={1.75} />
          <span>Conta</span>
        </Link>
      </nav>

      {toasts && toasts.length > 0 && (
        <div className="navi-toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`navi-toast ${t.type || ''}`} onClick={() => removeToast(t.id)} role="status">
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
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
