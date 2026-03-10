import React from 'react';
import { Shield, ArrowRight, LogIn } from 'lucide-react';
import { Link } from 'react-router-dom';

const Welcome = () => {
  return (
    <div className="welcome-page">
      <header className="welcome-header">
        <div className="container flex justify-between items-center">
          <div className="brand" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <img src="/pwa-192x192.svg" alt="FitGrow" width="28" height="28" />
            <span className="brand-title">FitGrow</span>
          </div>
          <Link to="/login" className="btn-ghost">
            <LogIn size={16} /> Entrar
          </Link>
        </div>
      </header>

      <main className="welcome-hero">
        <div className="container hero-inner">
          <h1 className="hero-title">CRM simples para academias de esportes</h1>
          <p className="hero-subtitle">
            Organize leads, agendamentos e matrículas em um só lugar. Pronto para artes marciais, dança, yoga e muito mais.
          </p>
          <div className="hero-cta">
            <Link to="/login" className="btn-primary btn-large">
              Criar conta <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-bullets">
            <div className="bullet">Leads e pipeline</div>
            <div className="bullet">Agendamentos rápidos</div>
            <div className="bullet">Multi-academia</div>
            <div className="bullet">Seguro e na nuvem</div>
          </div>
        </div>
      </main>

      <footer className="welcome-footer">
        <div className="container text-small" style={{ opacity: 0.8 }}>
          © {new Date().getFullYear()} FitGrow
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .welcome-page { min-height: 100vh; display: flex; flex-direction: column; background: linear-gradient(180deg, #0b0b0b 0%, #1f2937 100%); color: white; }
        .welcome-header { padding: 14px 0; background: rgba(255,255,255,0.06); border-bottom: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(8px); }
        .brand-title { font-weight: 900; letter-spacing: -0.02em; }
        .welcome-hero { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 0; }
        .hero-inner { max-width: 840px; text-align: center; }
        .hero-title { font-size: clamp(2rem, 5vw, 3rem); font-weight: 900; margin-bottom: 10px; }
        .hero-subtitle { font-size: 1.05rem; opacity: 0.9; }
        .hero-cta { margin: 24px 0; display: flex; justify-content: center; }
        .hero-bullets { margin-top: 24px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .bullet { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); padding: 10px 12px; border-radius: 10px; }
        .welcome-footer { padding: 16px 0; background: rgba(255,255,255,0.04); border-top: 1px solid rgba(255,255,255,0.08); text-align: center; }
        .btn-primary { background: var(--accent); color: white; border-radius: var(--radius-sm); padding: 10px 14px; display: inline-flex; align-items: center; gap: 8px; font-weight: 700; text-decoration: none; }
        .btn-ghost { background: none; border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: var(--radius-sm); padding: 8px 12px; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; font-weight: 700; }
      `}} />
    </div>
  );
};

export default Welcome;
