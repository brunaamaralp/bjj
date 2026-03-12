import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { LayoutGrid, Users, PlusCircle, GraduationCap, User, Shield, ShoppingBag, Boxes, BarChart3 } from 'lucide-react';
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
import { FEATURES } from './config/features';

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
          await setupAcademy(currentUser);
          try { document.activeElement && document.activeElement.blur && document.activeElement.blur(); } catch (e) { void e; }
          navigate('/', { replace: true });
        } else {
          navigate('/login', { replace: true });
        }
      } catch {
        navigate('/login', { replace: true });
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Create or find academy for user
  const setupAcademy = async (u) => {
    try {
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
        const doc = await databases.createDocument(DB_ID, ACADEMIES_COL, ID.unique(), {
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
        }, [
          Permission.read(Role.users()),
          Permission.update(Role.users()),
          Permission.delete(Role.users()),
        ]);
        academyId = doc.$id;
      }
      setAcademyId(academyId);
      localStorage.setItem('activeAcademyId', academyId);
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        try { useLeadStore.getState().setTeamId(null); } catch (e) { void e; }
        try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
        // Ensure default custom question 'Faixa' exists once
        try {
          let clq = [];
          if (doc.customLeadQuestions) {
            clq = typeof doc.customLeadQuestions === 'string' ? JSON.parse(doc.customLeadQuestions) : doc.customLeadQuestions;
            if (!Array.isArray(clq)) clq = [];
          }
          if (!clq.includes('Faixa')) {
            const updated = [...clq, 'Faixa'];
            await databases.updateDocument(DB_ID, ACADEMIES_COL, academyId, {
              customLeadQuestions: JSON.stringify(updated)
            });
            doc.customLeadQuestions = JSON.stringify(updated);
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
      try {
        const code = String(e?.code || '');
        const msg = String(e?.message || '');
        if (code === '401' || /authorized|scopes|unauthorized/i.test(msg)) {
          await authService.logout();
          setUser(null);
          useLeadStore.getState().setAcademyId(null);
          navigate('/login', { replace: true });
        }
      } catch { /* noop */ }
    }
  };

  const handleLogin = async (u) => {
    setUser(u);
    try { useLeadStore.getState().setUserId(u.$id); } catch (e) { void e; }
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
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--primary-gradient)',
      }}>
        <div style={{ textAlign: 'center', color: 'white' }}>
          <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
            <Shield size={48} color="white" />
          </div>
          <div className="spinner-white" />
        </div>
        <style dangerouslySetInnerHTML={{
          __html: `
          .spinner-white {
            width: 32px; height: 32px; margin: 0 auto;
            border: 3px solid rgba(255,255,255,0.3);
            border-top-color: white; border-radius: 50%;
            animation: spin 0.6s linear infinite;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
        `}} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app-container">
        <Routes>
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="/register" element={<Register onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/welcome" replace />} />
        </Routes>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="container flex justify-between items-center gap-4">
          <h1 className="header-logo" onClick={() => navigate('/')}>
            <img src="/pwa-192x192.svg" alt="FitGrow" width="24" height="24" style={{ marginRight: 8, verticalAlign: 'middle' }} /> FitGrow
          </h1>
          <div className="flex items-center gap-4">
            {academyList && academyList.length > 1 && (
              <select
                className="form-input"
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
                style={{ maxWidth: 280 }}
              >
                {academyList.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
            <button
              className="btn-outline"
              onClick={handleLogout}
              style={{ background: 'transparent', color: 'white', borderColor: 'rgba(255,255,255,0.5)' }}
            >
              Sair
            </button>
          </div>
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
          <div style={{ background: 'var(--warning-bg)', color: 'var(--warning-text)', padding: '8px 0' }}>
            <div className="container text-small">
              Algumas configurações do Appwrite estão ausentes: {missing.join(', ')}.
            </div>
          </div>
        );
      })()}

      <div className="layout">
        <aside className="side-nav">
          <div className="side-section">
            <span className="side-section-title">CRM</span>
            <Link to="/" className={`side-link ${isActive('/') ? 'active' : ''}`}>
              <LayoutGrid size={18} />
              <span>Início</span>
            </Link>
            <Link to="/new-lead" className="side-link primary">
              <PlusCircle size={18} />
              <span>Novo {leadSingular(labels.leads)}</span>
            </Link>
            <Link to="/pipeline" className={`side-link ${isActive('/pipeline') ? 'active' : ''}`}>
              <Users size={18} />
              <span>{labels.leads}</span>
            </Link>
            <Link to="/students" className={`side-link ${isActive('/students') ? 'active' : ''}`}>
              <GraduationCap size={18} />
              <span>{labels.students}</span>
            </Link>
            <Link to="/reports" className={`side-link ${isActive('/reports') ? 'active' : ''}`}>
              <BarChart3 size={18} />
              <span>Relatórios</span>
            </Link>
          </div>
          {((modules.inventory === true) || (modules.sales === true)) && (
            <div className="side-section">
              <span className="side-section-title">Operações</span>
              {modules.inventory === true && (
                <Link to="/estoque" className={`side-link ${isActive('/estoque') ? 'active' : ''}`}>
                  <Boxes size={18} />
                  <span>Estoque</span>
                </Link>
              )}
              {modules.sales === true && (
                <Link to="/vendas" className={`side-link ${isActive('/vendas') ? 'active' : ''}`}>
                  <ShoppingBag size={18} />
                  <span>Vendas</span>
                </Link>
              )}
            </div>
          )}
          <div className="side-section">
            <Link to="/profile" className={`side-link ${isActive('/profile') ? 'active' : ''}`}>
              <User size={18} />
              <span>Conta</span>
            </Link>
          </div>
        </aside>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/lead/:id" element={<LeadProfile />} />
            <Route path="/new-lead" element={<NewLead />} />
            <Route path="/reports" element={<Reports />} />
            {modules.inventory === true && <Route path="/estoque" element={<Inventory />} />}
            {modules.sales === true && <Route path="/vendas" element={<Sales />} />}
            <Route path="/students" element={<Students />} />
            <Route path="/profile" element={<Account user={user} onLogout={handleLogout} />} />
          </Routes>
        </main>
      </div>

      <nav className="bottom-nav">
        <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <LayoutGrid size={22} />
          <span>Início</span>
        </Link>
        <Link to="/pipeline" className={`nav-item ${isActive('/pipeline') ? 'active' : ''}`}>
          <Users size={22} />
          <span>{labels.leads}</span>
        </Link>
        <Link to="/new-lead" className="nav-item nav-fab">
          <div className="fab-btn">
            <PlusCircle size={28} />
          </div>
        </Link>
        <Link to="/students" className={`nav-item ${isActive('/students') ? 'active' : ''}`}>
          <GraduationCap size={22} />
          <span>{labels.students}</span>
        </Link>
        {modules.sales === true && (
          <Link to="/vendas" className={`nav-item ${isActive('/vendas') ? 'active' : ''}`}>
            <ShoppingBag size={22} />
            <span>Loja</span>
          </Link>
        )}
        <Link to="/profile" className={`nav-item ${isActive('/profile') ? 'active' : ''}`}>
          <User size={22} />
          <span>Conta</span>
        </Link>
      </nav>

      {toasts && toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.type}`} onClick={() => removeToast(t.id)}>
              <span>{t.message}</span>
            </div>
          ))}
        </div>
      )}

      <style dangerouslySetInnerHTML={{
        __html: `
          .app-container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            padding-bottom: 85px;
          }
          .toast-container {
            position: fixed;
            right: 16px;
            bottom: 90px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            z-index: 9999;
          }
          .toast {
            background: var(--surface);
            color: var(--text);
            border: 1px solid var(--border);
            box-shadow: var(--shadow);
            padding: 10px 12px;
            border-radius: var(--radius);
            cursor: pointer;
          }
          .toast.success { border-color: #2ecc71; }
          .toast.error { border-color: var(--danger); }
          :root {
            --warning-bg: #fff7e6;
            --warning-text: #8a6d3b;
          }
          .main-header {
            background: var(--primary-gradient);
            color: white;
            padding: 16px 0;
            position: sticky;
            top: 0;
            z-index: 100;
            box-shadow: 0 2px 20px rgba(10, 22, 40, 0.15);
          }
          .header-logo {
            color: white !important;
            font-size: 1.4rem;
            cursor: pointer;
            letter-spacing: -0.02em;
          }
          .layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 0;
          }
          .side-nav {
            display: none;
          }
          @media (min-width: 1024px) {
            .layout {
              grid-template-columns: 260px 1fr;
              gap: 16px;
              padding: 16px;
            }
            .side-nav {
              display: flex;
              flex-direction: column;
              background: var(--surface);
              border-right: 1px solid var(--border-light);
              border-radius: var(--radius);
              padding: 16px;
              height: calc(100vh - 120px);
              position: sticky;
              top: 88px;
            }
            .main-content {
              padding-right: 8px;
            }
          }
          .side-section {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-bottom: 14px;
          }
          .side-section-title {
            font-size: 0.72rem;
            color: var(--text-muted);
            font-weight: 800;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            padding: 4px 8px;
          }
          .side-link {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            text-decoration: none;
            color: var(--text-secondary);
            border-radius: var(--radius-sm);
            font-weight: 700;
            transition: var(--transition);
          }
          .side-link:hover { background: var(--surface-hover); }
          .side-link.active { background: var(--accent-light); color: var(--accent); }
          .side-link.primary { background: var(--accent); color: white; }
          .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: rgba(255,255,255,0.85);
            backdrop-filter: saturate(180%) blur(12px);
            display: flex;
            justify-content: space-around;
            align-items: center;
            height: 72px;
            box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.06);
            border-top: 1px solid var(--border-light);
            padding: 0 8px;
            padding-bottom: env(safe-area-inset-bottom, 0);
            z-index: 100;
          }
          @media (min-width: 1024px) {
            .bottom-nav { display: none; }
            .app-container { padding-bottom: 0; }
          }
          .nav-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-decoration: none;
            color: var(--text-muted);
            font-size: 0.68rem;
            font-weight: 600;
            gap: 3px;
            padding: 6px 12px;
            border-radius: var(--radius-sm);
            transition: var(--transition);
            position: relative;
          }
          .nav-item.active {
            color: var(--accent);
          }
          .nav-item.active::after {
            content: '';
            position: absolute;
            top: -1px;
            left: 50%;
            transform: translateX(-50%);
            width: 20px;
            height: 3px;
            background: var(--accent);
            border-radius: 0 0 3px 3px;
          }
          .nav-fab {
            margin-top: -20px;
          }
          .fab-btn {
            width: 52px;
            height: 52px;
            background: var(--accent);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            box-shadow: var(--shadow-accent);
            transition: var(--transition);
          }
          .nav-fab:active .fab-btn { transform: scale(0.92); }
        `}} />
    </div>
  );
};

export default App;
