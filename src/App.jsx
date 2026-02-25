import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutGrid, Users, PlusCircle, GraduationCap, User } from 'lucide-react';
import { authService } from './lib/auth';
import { databases, DB_ID, ACADEMIES_COL } from './lib/appwrite';
import { ID, Query } from 'appwrite';
import { useLeadStore } from './store/useLeadStore';
import Dashboard from './pages/Dashboard';
import Pipeline from './pages/Pipeline';
import LeadProfile from './pages/LeadProfile';
import NewLead from './pages/NewLead';
import Students from './pages/Students';
import Account from './pages/Account';
import Login from './pages/Login';

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const setAcademyId = useLeadStore((s) => s.setAcademyId);
  const fetchLeads = useLeadStore((s) => s.fetchLeads);

  const isActive = (path) => location.pathname === path;

  // Check session on mount
  useEffect(() => {
    const init = async () => {
      try {
        const currentUser = await authService.getCurrentUser();
        if (currentUser) {
          setUser(currentUser);
          await setupAcademy(currentUser);
        }
      } catch {
        // No session
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
        Query.equal('ownerId', u.$id),
        Query.limit(1),
      ]);
      let academyId;
      if (res.documents.length > 0) {
        academyId = res.documents[0].$id;
      } else {
        const doc = await databases.createDocument(DB_ID, ACADEMIES_COL, ID.unique(), {
          name: u.name || '',
          phone: '',
          email: u.email || '',
          address: '',
          ownerId: u.$id,
        });
        academyId = doc.$id;
      }
      setAcademyId(academyId);
      // Fetch leads after academy is set
      useLeadStore.getState().setAcademyId(academyId);
      await useLeadStore.getState().fetchLeads();
    } catch (e) {
      console.error('setupAcademy error:', e);
    }
  };

  const handleLogin = async (u) => {
    setUser(u);
    await setupAcademy(u);
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
          <div style={{ fontSize: '3rem', marginBottom: 12 }}>🥋</div>
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
    return <Login onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <header className="main-header">
        <div className="container flex justify-between items-center gap-4">
          <h1 className="header-logo" onClick={() => navigate('/')}>
            🥋 BJJ CRM
          </h1>
        </div>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/lead/:id" element={<LeadProfile />} />
          <Route path="/new-lead" element={<NewLead />} />
          <Route path="/students" element={<Students />} />
          <Route path="/profile" element={<Account user={user} onLogout={handleLogout} />} />
        </Routes>
      </main>

      <nav className="bottom-nav">
        <Link to="/" className={`nav-item ${isActive('/') ? 'active' : ''}`}>
          <LayoutGrid size={22} />
          <span>Início</span>
        </Link>
        <Link to="/pipeline" className={`nav-item ${isActive('/pipeline') ? 'active' : ''}`}>
          <Users size={22} />
          <span>Leads</span>
        </Link>
        <Link to="/new-lead" className="nav-item nav-fab">
          <div className="fab-btn">
            <PlusCircle size={28} />
          </div>
        </Link>
        <Link to="/students" className={`nav-item ${isActive('/students') ? 'active' : ''}`}>
          <GraduationCap size={22} />
          <span>Alunos</span>
        </Link>
        <Link to="/profile" className={`nav-item ${isActive('/profile') ? 'active' : ''}`}>
          <User size={22} />
          <span>Conta</span>
        </Link>
      </nav>

      <style dangerouslySetInnerHTML={{
        __html: `
          .app-container {
            display: flex;
            flex-direction: column;
            min-height: 100vh;
            padding-bottom: 85px;
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
          .bottom-nav {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            background: var(--surface);
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
