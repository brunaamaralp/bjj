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
        .hero-inner { width: 100%; max-width: 1024px; display: flex; flex-direction: column; gap: 28px; }
        .hero-card { background: white; border: 1px solid var(--border-light); border-radius: 16px; padding: 28px; box-shadow: var(--shadow); text-align: center; position: relative; overflow: hidden; }
        .hero-card::before { content: ''; position: absolute; width: 240px; height: 240px; background: radial-gradient(closest-side, rgba(0,188,142,0.15), transparent); right: -60px; top: -60px; filter: blur(2px); }
        .hero-title { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 900; margin-bottom: 8px; color: var(--text); }
        .hero-subtitle { font-size: 1.1rem; color: var(--text-secondary); }
        .hero-paragraph { margin-top: 6px; color: var(--text-secondary); }
        .hero-cta { margin: 24px 0; display: flex; justify-content: center; }
        .pill-row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .pill { background: var(--surface-hover); border: 1px solid var(--border); padding: 8px 12px; border-radius: 999px; font-weight: 700; font-size: 0.82rem; color: var(--text-secondary); }
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
