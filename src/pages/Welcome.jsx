import React from 'react';
import { ArrowRight, LogIn } from 'lucide-react';
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
          <div className="hero-grid">
            <div className="hero-card">
            <h1 className="hero-title">CRM simples para academias e estúdios fitness</h1>
            <p className="hero-subtitle">
              Gerencie leads, aulas experimentais, agendamentos e matrículas em um único lugar.
            </p>
            <p className="hero-paragraph">
              O FitGrow foi criado para academias, estúdios e escolas esportivas que precisam organizar o crescimento sem complicação.
            </p>
            <div className="hero-cta">
              <Link to="/login" className="btn-primary btn-large">
                Criar conta <ArrowRight size={18} />
              </Link>
            </div>
            <div className="pill-row">
              <span className="pill">Leads e pipeline</span>
              <span className="pill">Agendamentos rápidos</span>
              <span className="pill">Multi-academia</span>
              <span className="pill">100% online</span>
            </div>
            </div>
            <div className="hero-visual card">
              <svg viewBox="0 0 560 360" width="100%" height="auto" role="img" aria-label="Exemplo de pipeline e agenda">
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#00bc8e" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#00bc8e" stopOpacity="0.6" />
                  </linearGradient>
                  <filter id="s" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.12" />
                  </filter>
                </defs>
                <rect x="0" y="0" width="560" height="360" rx="14" fill="#ffffff" />
                <rect x="16" y="16" width="320" height="20" rx="6" fill="#f1f5f9" />
                <rect x="344" y="16" width="200" height="20" rx="6" fill="#f1f5f9" />
                <g transform="translate(16,52)">
                  <rect width="165" height="24" rx="8" fill="#f1f5f9" />
                  <rect x="180" width="165" height="24" rx="8" fill="#f1f5f9" />
                  <rect x="360" width="165" height="24" rx="8" fill="#f1f5f9" />
                </g>
                <g transform="translate(16,86)">
                  <rect width="165" height="244" rx="12" fill="#ffffff" stroke="#e5e7eb" />
                  <rect x="180" width="165" height="244" rx="12" fill="#ffffff" stroke="#e5e7eb" />
                  <rect x="360" width="165" height="244" rx="12" fill="#ffffff" stroke="#e5e7eb" />
                  <g transform="translate(10,12)">
                    <rect width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" filter="url(#s)" />
                    <rect y="66" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="132" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                  </g>
                  <g transform="translate(190,12)">
                    <rect width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="66" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="132" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="198" width="145" height="30" rx="8" fill="url(#g1)" />
                  </g>
                  <g transform="translate(370,12)">
                    <rect width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="66" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                    <rect y="132" width="145" height="54" rx="10" fill="#f8fafc" stroke="#e5e7eb" />
                  </g>
                </g>
                <g transform="translate(360,18)">
                  <circle cx="0" cy="0" r="4" fill="#00bc8e" />
                  <circle cx="14" cy="0" r="4" fill="#cbd5e1" />
                  <circle cx="28" cy="0" r="4" fill="#cbd5e1" />
                </g>
                <g transform="translate(344,52)">
                  <rect width="200" height="120" rx="12" fill="#ffffff" stroke="#e5e7eb" />
                  <rect x="12" y="12" width="80" height="10" rx="5" fill="#e5e7eb" />
                  <rect x="12" y="32" width="60" height="10" rx="5" fill="#e5e7eb" />
                  <rect x="12" y="52" width="176" height="10" rx="5" fill="#f1f5f9" />
                  <rect x="12" y="72" width="120" height="10" rx="5" fill="#f1f5f9" />
                  <rect x="12" y="92" width="140" height="10" rx="5" fill="#f1f5f9" />
                </g>
                <g transform="translate(344,184)">
                  <rect width="200" height="146" rx="12" fill="#ffffff" stroke="#e5e7eb" />
                  <rect x="12" y="12" width="120" height="10" rx="5" fill="#e5e7eb" />
                  <rect x="12" y="32" width="176" height="10" rx="5" fill="#f1f5f9" />
                  <rect x="12" y="52" width="160" height="10" rx="5" fill="#f1f5f9" />
                  <rect x="12" y="102" width="76" height="28" rx="8" fill="url(#g1)" />
                </g>
              </svg>
            </div>
          </div>

          <section className="section grid-2">
            <div className="card">
              <h3 className="card-title">Pare de controlar alunos em planilhas ou mensagens perdidas.</h3>
              <p className="card-text">
                Com o FitGrow, você acompanha cada novo interessado desde o primeiro contato até a matrícula, de forma simples e organizada.
              </p>
            </div>
            <div className="card">
              <h3 className="card-title">Ideal para:</h3>
              <ul className="list">
                <li>Academias de musculação</li>
                <li>Estúdios de dança</li>
                <li>Escolas de artes marciais</li>
                <li>Yoga e pilates</li>
                <li>Cross training e funcional</li>
                <li>Qualquer negócio fitness com aulas e novos alunos</li>
              </ul>
            </div>
          </section>

          <section className="section grid-3">
            <div className="card feature">
              <h4 className="feature-title">Gestão de leads e pipeline</h4>
              <p className="card-text">Visualize todos os interessados, acompanhe cada etapa do funil e não perca oportunidades.</p>
            </div>
            <div className="card feature">
              <h4 className="feature-title">Agendamentos rápidos</h4>
              <p className="card-text">Marque aulas experimentais ou avaliações em poucos cliques e mantenha tudo organizado.</p>
            </div>
            <div className="card feature">
              <h4 className="feature-title">Controle de matrículas</h4>
              <p className="card-text">Transforme leads em alunos e acompanhe quem está ativo ou em processo de entrada.</p>
            </div>
            <div className="card feature">
              <h4 className="feature-title">Multi-academia</h4>
              <p className="card-text">Gerencie várias unidades ou estúdios em uma única plataforma.</p>
            </div>
            <div className="card feature">
              <h4 className="feature-title">100% online e seguro</h4>
              <p className="card-text">Acesse de qualquer lugar, com seus dados protegidos na nuvem.</p>
            </div>
          </section>

          <section className="section cta-center">
            <h3 className="cta-title">Mais organização. Mais alunos.</h3>
            <p className="card-text">
              O FitGrow ajuda você a organizar sua gestão comercial, melhorar o acompanhamento de novos alunos e aumentar suas matrículas sem aumentar a complexidade do seu dia a dia.
            </p>
            <p className="muted">Leva menos de 2 minutos para começar.</p>
            <Link to="/login" className="btn-primary btn-large" style={{ maxWidth: 260 }}>
              Criar conta <ArrowRight size={18} />
            </Link>
          </section>
        </div>
      </main>

      <footer className="welcome-footer">
        <div className="container text-small" style={{ opacity: 0.8 }}>
          © 2026 FitGrow
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{
        __html: `
        .welcome-page { min-height: 100vh; display: flex; flex-direction: column; background: #f8fafc; color: var(--text); }
        .welcome-header { padding: 14px 0; background: white; border-bottom: 1px solid var(--border-light); position: sticky; top: 0; z-index: 10; }
        .brand-title { font-weight: 900; letter-spacing: -0.02em; color: var(--text); }
        .welcome-hero { flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: 40px 0; }
        .hero-inner { width: 100%; max-width: 1100px; display: flex; flex-direction: column; gap: 28px; }
        .hero-grid { display: grid; grid-template-columns: 1fr; gap: 16px; align-items: stretch; }
        @media (min-width: 900px) { .hero-grid { grid-template-columns: 1.1fr 1fr; } }
        .hero-card { background: white; border: 1px solid var(--border-light); border-radius: 16px; padding: 28px; box-shadow: var(--shadow); text-align: center; position: relative; overflow: hidden; }
        .hero-card::before { content: ''; position: absolute; width: 240px; height: 240px; background: radial-gradient(closest-side, rgba(0,188,142,0.15), transparent); right: -60px; top: -60px; filter: blur(2px); }
        .hero-title { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 900; margin-bottom: 8px; color: var(--text); }
        .hero-subtitle { font-size: 1.1rem; color: var(--text-secondary); }
        .hero-paragraph { margin-top: 6px; color: var(--text-secondary); }
        .hero-cta { margin: 24px 0; display: flex; justify-content: center; }
        .pill-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .pill { background: var(--surface-hover); border: 1px solid var(--border); padding: 8px 12px; border-radius: 999px; font-weight: 700; font-size: 0.82rem; color: var(--text-secondary); }
        .hero-visual { display: flex; align-items: center; justify-content: center; padding: 0; overflow: hidden; }
        .section { background: white; border: 1px solid var(--border-light); border-radius: 16px; padding: 20px; box-shadow: var(--shadow-sm); }
        .grid-2 { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .grid-3 { display: grid; grid-template-columns: 1fr; gap: 12px; }
        @media (min-width: 900px) { .grid-2 { grid-template-columns: 1fr 1fr; } .grid-3 { grid-template-columns: repeat(3, 1fr); } }
        .card { background: white; border: 1px solid var(--border-light); border-radius: 14px; padding: 18px; }
        .card-title { font-size: 1.05rem; font-weight: 800; color: var(--text); margin-bottom: 6px; }
        .card-text { color: var(--text-secondary); }
        .list { margin: 0; padding-left: 18px; color: var(--text-secondary); line-height: 1.6; }
        .feature-title { font-weight: 800; margin-bottom: 4px; color: var(--text); }
        .cta-center { text-align: center; display: flex; flex-direction: column; gap: 10px; }
        .cta-title { font-size: 1.4rem; font-weight: 900; color: var(--text); }
        .muted { color: var(--text-muted); }
        .welcome-footer { padding: 16px 0; background: white; border-top: 1px solid var(--border-light); text-align: center; }
        .btn-primary { background: var(--accent); color: white; border-radius: var(--radius-sm); padding: 12px 16px; display: inline-flex; align-items: center; gap: 8px; font-weight: 700; text-decoration: none; box-shadow: var(--shadow-accent); }
        .btn-ghost { background: none; border: 1px solid var(--border); color: var(--text); border-radius: var(--radius-sm); padding: 8px 12px; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; font-weight: 700; }
      `}} />
    </div>
  );
};

export default Welcome;
