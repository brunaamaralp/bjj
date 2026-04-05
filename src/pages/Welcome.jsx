import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  LogIn,
  MessageCircle,
  Calendar,
  FileText,
  LayoutGrid,
  Bot,
  Users,
  Building2,
} from 'lucide-react';
import NaviLogo from '../components/NaviLogo.jsx';
import NaviWordmark from '../components/NaviWordmark.jsx';

function KanbanTag({ children }) {
  return (
    <span className="navi-land-kanban-tag">{children}</span>
  );
}

function ProductMock() {
  return (
    <div className="navi-land-mock">
      <div className="navi-land-mock-top">
        <div className="navi-land-mock-top-left">
          <NaviLogo size={20} variant="white" />
          <NaviWordmark fontSize={15} variant="light" />
        </div>
        <div className="navi-land-mock-pills">
          <span className="navi-land-mock-pill navi-land-mock-pill--on">Funil</span>
          <span className="navi-land-mock-pill">Atendimento</span>
          <span className="navi-land-mock-pill">Alunos</span>
        </div>
      </div>
      <div className="navi-land-mock-stats">
        <div className="navi-land-stat navi-land-stat--vio">
          <span className="navi-land-stat-num navi-land-stat-num--vio">7</span>
          <span className="navi-land-stat-lbl">Leads ativos</span>
        </div>
        <div className="navi-land-stat navi-land-stat--cor">
          <span className="navi-land-stat-num navi-land-stat-num--cor">3</span>
          <span className="navi-land-stat-lbl">Não lidos</span>
        </div>
        <div className="navi-land-stat navi-land-stat--ok">
          <span className="navi-land-stat-num navi-land-stat-num--ok">12</span>
          <span className="navi-land-stat-lbl">Matriculados</span>
        </div>
      </div>
      <div className="navi-land-mock-kanban">
        <div className="navi-land-kcol">
          <div className="navi-land-kcol-title">Leads</div>
          <div className="navi-land-kcard navi-land-kcard--v">
            <div className="navi-land-kname">Rafael M.</div>
            <KanbanTag>Jiu-Jitsu</KanbanTag>
          </div>
          <div className="navi-land-kcard navi-land-kcard--v">
            <div className="navi-land-kname">Julia S.</div>
            <KanbanTag>No-Gi</KanbanTag>
          </div>
        </div>
        <div className="navi-land-kcol">
          <div className="navi-land-kcol-title">Em contato</div>
          <div className="navi-land-kcard navi-land-kcard--c">
            <div className="navi-land-kname">Marina Costa</div>
            <KanbanTag>Kids</KanbanTag>
          </div>
        </div>
        <div className="navi-land-kcol">
          <div className="navi-land-kcol-title">Matriculados</div>
          <div className="navi-land-kcard navi-land-kcard--g">
            <div className="navi-land-kname">Pedro Lima</div>
            <KanbanTag>Adulto</KanbanTag>
          </div>
        </div>
      </div>
    </div>
  );
}

const PAIN = [
  {
    Icon: MessageCircle,
    title: 'Lead sumiu no WhatsApp',
    desc: 'Perguntou o preço, você respondeu, nunca mais apareceu…',
  },
  {
    Icon: Calendar,
    title: 'Aula marcada e esquecida',
    desc: 'Confirmado no grupo, anotado num papel, alguém não apareceu…',
  },
  {
    Icon: FileText,
    title: 'A planilha que você odeia',
    desc: 'Você sabe que tem uma. Sabe que está desatualizada…',
  },
];

const FEAT_PILLS = [
  { Icon: LayoutGrid, label: 'Pipeline de leads' },
  { Icon: Bot, label: 'WhatsApp + IA' },
  { Icon: Users, label: 'Gestão de alunos' },
  { Icon: Calendar, label: 'Aulas experimentais' },
  { Icon: Building2, label: 'Multi-academia' },
];

const FEAT_ROWS = [
  ['01', 'Pipeline de leads visual', <>Do primeiro contato à <span className="navi-land-feat-kw">matrícula</span> em colunas</>],
  ['02', 'Atendimento via IA no WhatsApp', <>Responde <span className="navi-land-feat-kw">automaticamente.</span> Você assume quando quiser</>],
  ['03', 'Gestão de alunos ativos', <>Ativo, pausado, em débito — em <span className="navi-land-feat-kw">segundos</span></>],
  ['04', 'Agendamento de experimentais', <>Marca a aula direto na <span className="navi-land-feat-kw">conversa</span></>],
  ['05', 'Multi-academia', <>Várias unidades, <span className="navi-land-feat-kw">um painel</span></>],
];

const Welcome = () => (
  <div className="navi-land">
    <nav className="navi-land-nav">
      <div className="navi-land-nav-inner">
        <Link to="/" className="navi-land-nav-brand">
          <NaviLogo size={26} />
          <NaviWordmark fontSize={20} />
        </Link>
        <div className="navi-land-nav-cta">
          <Link to="/login" className="navi-land-btn-nav-ghost">
            <LogIn size={15} strokeWidth={2.4} aria-hidden />
            Entrar
          </Link>
          <Link to="/cadastro" className="navi-land-btn-nav-primary">
            Criar conta grátis
          </Link>
        </div>
      </div>
    </nav>

    <section className="navi-land-hero">
      <div className="navi-land-hero-grid">
        <div className="navi-land-hero-left">
          <div className="hero-badge navi-land-hero-badge">
            <span className="navi-land-badge-dot" aria-hidden />
            Para academias e estúdios
          </div>
          <h1 className="hero-headline navi-land-hero-h1">
            Chega de lead
            <br />
            perdido no
            <br />
            <em>WhatsApp.</em>
          </h1>
          <p className="hero-sub navi-land-hero-sub">
            Navi organiza seus contatos, agendamentos e alunos em um só lugar — com atendimento por IA e funil visual.
            Sem planilha, sem mensagem esquecida.
          </p>
          <Link to="/cadastro" className="btn-hero navi-land-hero-btn">
            Começar grátis
            <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
          </Link>
          <div className="hero-no-card navi-land-hero-hint">
            <span className="navi-land-hint-check" aria-hidden>
              ✓
            </span>
            <span>Sem cartão de crédito · Leva menos de 2 minutos</span>
          </div>
          <div className="hero-proof navi-land-hero-proof">
            <div className="navi-land-avatars" aria-hidden>
              <span className="navi-land-av" style={{ background: 'linear-gradient(135deg,#7B63D4,#5B3FBF)' }} />
              <span className="navi-land-av" style={{ background: 'linear-gradient(135deg,#BDB0EE,#7B63D4)' }} />
              <span className="navi-land-av" style={{ background: 'linear-gradient(135deg,#F04040,#c53030)' }} />
              <span className="navi-land-av" style={{ background: 'linear-gradient(135deg,#276534,#3bad6e)' }} />
            </div>
            <p className="navi-land-proof-text">
              <strong>+120 estúdios</strong>
              <span> já organizam seus alunos com o Navi</span>
            </p>
          </div>
        </div>
        <div className="hero-right navi-land-hero-right">
          <ProductMock />
        </div>
      </div>
    </section>

    <section className="navi-land-pain">
      <p className="navi-land-pain-eyebrow">Você conhece essa situação</p>
      <h2 className="navi-land-pain-h2">
        Seu estúdio cresce.
        <br />
        <em>O caos também.</em>
      </h2>
      <div className="pain-cards navi-land-pain-grid">
        {PAIN.map(({ Icon, title, desc }) => (
          <div key={title} className="navi-land-pain-card">
            <div className="navi-land-pain-ico">
              <Icon size={20} color="var(--v500)" strokeWidth={2} aria-hidden />
            </div>
            <h3 className="navi-land-pain-card-title">{title}</h3>
            <p className="navi-land-pain-card-desc">{desc}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="navi-land-features">
      <p className="navi-land-feat-eyebrow">O que o Navi resolve</p>
      <h2 className="navi-land-feat-h2">
        Tudo que falta no seu estúdio.
        <br />
        <em>Em um lugar só.</em>
      </h2>
      <div className="feat-pills navi-land-feat-pills">
        {FEAT_PILLS.map(({ Icon, label }) => (
          <button key={label} type="button" className="navi-land-feat-pill">
            <Icon size={28} strokeWidth={1.75} color="var(--v500)" aria-hidden />
            {label}
          </button>
        ))}
      </div>
      <div className="feat-list navi-land-feat-list">
        {FEAT_ROWS.map(([num, title, desc], i) => (
          <div key={num} className={`feat-row navi-land-feat-row${i === FEAT_ROWS.length - 1 ? ' navi-land-feat-row--last' : ''}`}>
            <span className="feat-num navi-land-feat-num">{num}</span>
            <span className="feat-title navi-land-feat-title">{title}</span>
            <span className="navi-land-feat-desc">{desc}</span>
          </div>
        ))}
      </div>
    </section>

    <section className="navi-land-cta-outer">
      <div className="cta-inner navi-land-cta-inner">
        <h2 className="cta-headline navi-land-cta-h2">
          Organize seu estúdio
          <br />
          em menos de <em>10 minutos.</em>
        </h2>
        <p className="navi-land-cta-sub">Sem cartão de crédito. Sem complicação. Sem planilha.</p>
        <Link to="/cadastro" className="navi-land-cta-btn">
          Criar conta grátis
          <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
        </Link>
        <p className="navi-land-cta-hint">Mais de 120 estúdios já começaram</p>
      </div>
    </section>

    <footer className="navi-land-footer">
      <div className="navi-land-footer-inner">
        <div className="navi-land-footer-brand">
          <NaviLogo size={20} />
          <NaviWordmark fontSize={16} />
        </div>
        <p className="footer-copy navi-land-footer-copy">© 2026 Navi · Todos os direitos reservados</p>
      </div>
    </footer>

    <style dangerouslySetInnerHTML={{ __html: `
      @keyframes navi-land-fade-up {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }
      @keyframes navi-land-pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.35; }
      }

      .navi-land {
        --nl-pad: 48px;
        min-height: 100vh;
        background: #FFFFFF;
        color: var(--ink);
        font-family: var(--ff-ui);
      }
      @media (max-width: 768px) {
        .navi-land { --nl-pad: 20px; }
      }

      .navi-land-nav {
        position: sticky;
        top: 0;
        z-index: 100;
        height: 58px;
        display: flex;
        align-items: center;
        padding: 0 var(--nl-pad);
        background: rgba(255, 255, 255, 0.92);
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        border-bottom: 1.5px solid #F0EEF8;
      }
      .navi-land-nav-inner {
        max-width: 1100px;
        width: 100%;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .navi-land-nav-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: inherit;
      }
      .navi-land-nav-cta { display: flex; align-items: center; gap: 10px; }
      .navi-land-btn-nav-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        color: var(--v500);
        background: var(--v50);
        border: none;
        transition: background 0.15s ease;
      }
      .navi-land-btn-nav-ghost:hover { background: var(--v100); }
      .navi-land-btn-nav-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 7px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        color: white;
        background: var(--v500);
        border: none;
        box-shadow: 0 2px 10px rgba(91, 63, 191, 0.28);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-land-btn-nav-primary:hover {
        background: var(--v700);
        transform: translateY(-1px);
      }
      @media (max-width: 768px) {
        .navi-land-btn-nav-ghost { display: none !important; }
      }

      .navi-land-hero-grid {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 var(--nl-pad);
        min-height: calc(100vh - 58px);
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        gap: 40px;
      }
      .navi-land-hero-left { padding-right: 52px; }
      .navi-land-hero-badge {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        background: var(--v500);
        color: white;
        border-radius: 99px;
        padding: 5px 14px 5px 10px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        margin-bottom: 22px;
        animation: navi-land-fade-up 0.45s 0s ease both;
      }
      .navi-land-badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--c500);
        animation: navi-land-pulse-dot 1.6s ease-in-out infinite;
      }
      .navi-land-hero-h1 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: clamp(34px, 4vw, 52px);
        letter-spacing: -0.025em;
        line-height: 1.1;
        color: var(--ink);
        margin: 0 0 18px;
        animation: navi-land-fade-up 0.45s 0.07s ease both;
      }
      .navi-land-hero-sub {
        font-size: 16px;
        font-weight: 400;
        color: var(--mid);
        line-height: 1.7;
        max-width: 400px;
        margin: 0 0 32px;
        animation: navi-land-fade-up 0.45s 0.13s ease both;
      }
      .navi-land-hero-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 14px 28px;
        border-radius: 11px;
        font-size: 15px;
        font-weight: 700;
        text-decoration: none;
        color: white;
        background: var(--v500);
        border: none;
        box-shadow: 0 6px 20px rgba(91, 63, 191, 0.28);
        margin-bottom: 12px;
        transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        animation: navi-land-fade-up 0.45s 0.18s ease both;
      }
      .navi-land-hero-btn:hover {
        background: var(--v700);
        transform: translateY(-2px);
        box-shadow: 0 8px 26px rgba(91, 63, 191, 0.35);
      }
      .navi-land-hero-btn:active { transform: scale(0.98); }
      .navi-land-hero-hint {
        font-family: var(--ff-mono);
        font-size: 10px;
        color: var(--faint);
        letter-spacing: 0.06em;
        margin: 0 0 32px;
        display: flex;
        align-items: center;
        gap: 6px;
        animation: navi-land-fade-up 0.45s 0.21s ease both;
      }
      .navi-land-hint-check { color: var(--success-text); font-size: 12px; }
      .navi-land-hero-proof {
        display: flex;
        align-items: center;
        gap: 14px;
        animation: navi-land-fade-up 0.45s 0.25s ease both;
      }
      .navi-land-avatars { display: flex; align-items: center; }
      .navi-land-av {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        border: 2.5px solid white;
        margin-left: -8px;
        box-shadow: 0 2px 8px rgba(91, 63, 191, 0.12);
      }
      .navi-land-av:first-child { margin-left: 0; }
      .navi-land-proof-text { margin: 0; font-size: 14px; line-height: 1.45; max-width: 260px; }
      .navi-land-proof-text strong { font-weight: 700; color: var(--ink); }
      .navi-land-proof-text span { color: var(--mid); font-weight: 400; }

      .navi-land-hero-right { animation: navi-land-fade-up 0.45s 0.09s ease both; }
      .navi-land-mock {
        border: 1.5px solid #E8E4FF;
        border-radius: 18px;
        overflow: hidden;
        background: white;
        box-shadow: 0 16px 48px rgba(91, 63, 191, 0.12), 0 3px 10px rgba(91, 63, 191, 0.06);
      }
      .navi-land-mock-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        background: var(--v500);
      }
      .navi-land-mock-top-left { display: flex; align-items: center; gap: 8px; }
      .navi-land-mock-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .navi-land-mock-pill {
        font-size: 9px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.55);
        font-family: var(--ff-ui);
      }
      .navi-land-mock-pill--on {
        background: rgba(255, 255, 255, 0.18);
        color: white;
      }
      .navi-land-mock-stats {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        padding: 12px;
        border-bottom: 1px solid #F0EEF8;
        background: white;
      }
      .navi-land-stat {
        border-radius: 12px;
        padding: 12px 10px;
        text-align: center;
      }
      .navi-land-stat--vio { background: var(--v50); }
      .navi-land-stat--cor { background: var(--c50); }
      .navi-land-stat--ok { background: #E8F5EC; }
      .navi-land-stat-num {
        display: block;
        font-family: var(--ff-ui);
        font-size: 22px;
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 4px;
      }
      .navi-land-stat-num--vio { color: var(--v500); }
      .navi-land-stat-num--cor { color: var(--c500); }
      .navi-land-stat-num--ok { color: #276534; }
      .navi-land-stat-lbl {
        font-size: 10px;
        font-weight: 600;
        color: var(--mid);
      }
      .navi-land-mock-kanban {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 8px;
        padding: 12px;
        background: #FAFAFE;
        min-height: 160px;
      }
      .navi-land-kcol-title {
        font-family: var(--ff-mono);
        font-size: 8px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--faint);
        margin-bottom: 8px;
      }
      .navi-land-kcard {
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 6px;
      }
      .navi-land-kcard--v { background: var(--v50); }
      .navi-land-kcard--c { background: var(--c50); }
      .navi-land-kcard--g { background: var(--success-bg); }
      .navi-land-kname {
        font-family: var(--ff-ui);
        font-size: 10px;
        font-weight: 700;
        color: var(--ink);
        margin-bottom: 6px;
      }
      .navi-land-kanban-tag {
        font-family: var(--ff-ui);
        font-style: normal;
        font-weight: 600;
        font-size: 8px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--v100);
        color: var(--v700);
      }
      .navi-land-feat-kw {
        font-family: var(--ff-ui);
        font-weight: 700;
        font-style: normal;
        color: var(--v500);
      }

      .navi-land-pain {
        background: var(--bg);
        padding: 72px var(--nl-pad);
      }
      .navi-land-pain > * { max-width: 1100px; margin-left: auto; margin-right: auto; }
      .navi-land-pain-eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--faint);
        margin: 0 0 14px;
      }
      .navi-land-pain-h2 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: 32px;
        letter-spacing: -0.025em;
        line-height: 1.15;
        color: var(--ink);
        margin: 0 0 36px;
      }
      .navi-land-pain-grid {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 16px;
      }
      .navi-land-pain-card {
        background: white;
        border-radius: 16px;
        padding: 22px;
        border: 1px solid #EAE6FF;
      }
      .navi-land-pain-ico {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: white;
        border: 1px solid #EAE6FF;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 14px;
      }
      .navi-land-pain-card-title {
        font-size: 14px;
        font-weight: 700;
        margin: 0 0 8px;
        color: var(--ink);
      }
      .navi-land-pain-card-desc {
        font-size: 12.5px;
        color: var(--mid);
        line-height: 1.6;
        margin: 0;
      }

      .navi-land-features {
        background: white;
        padding: 72px var(--nl-pad) 72px;
        max-width: 1100px;
        margin: 0 auto;
      }
      .navi-land-feat-eyebrow {
        font-family: var(--ff-mono);
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--faint);
        margin: 0 0 12px;
      }
      .navi-land-feat-h2 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: clamp(28px, 3.5vw, 36px);
        letter-spacing: -0.03em;
        line-height: 1.15;
        margin: 0 0 28px;
        color: var(--ink);
      }
      .navi-land-feat-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 28px;
      }
      .navi-land-feat-pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 11px 16px;
        border-radius: 12px;
        background: white;
        border: 1.5px solid #EAE6FF;
        font-size: 13px;
        font-weight: 600;
        color: var(--ink);
        font-family: var(--ff-ui);
        cursor: default;
        transition: border-color 0.15s ease, background 0.15s ease, color 0.15s ease;
      }
      .navi-land-feat-pill:hover {
        border-color: var(--v400);
        background: var(--v50);
        color: var(--v700);
      }
      .navi-land-feat-list {
        border: 0.5px solid rgba(91, 63, 191, 0.1);
        border-radius: 14px;
        overflow: hidden;
        background: white;
      }
      .navi-land-feat-row {
        display: grid;
        grid-template-columns: 44px 1fr 1fr;
        padding: 18px 24px;
        border-bottom: 0.5px solid rgba(91, 63, 191, 0.08);
        align-items: start;
        gap: 12px;
        transition: background 0.15s ease;
      }
      .navi-land-feat-row--last { border-bottom: none; }
      .navi-land-feat-row:hover { background: var(--v50); }
      .navi-land-feat-num {
        font-family: var(--ff-mono);
        font-size: 11px;
        color: var(--faint);
      }
      .navi-land-feat-title {
        font-size: 14px;
        font-weight: 700;
        color: var(--ink);
      }
      .navi-land-feat-desc {
        font-size: 12.5px;
        color: var(--mid);
        text-align: right;
        line-height: 1.55;
      }

      .navi-land-cta-outer {
        max-width: 1100px;
        margin: 0 auto;
        padding: 0 var(--nl-pad) 72px;
      }
      .navi-land-cta-inner {
        background: var(--v500);
        border-radius: 20px;
        padding: 56px 48px;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 20px;
      }
      .navi-land-cta-h2 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: 36px;
        line-height: 1.15;
        color: white;
        margin: 0;
        letter-spacing: -0.02em;
      }
      .navi-land-cta-sub {
        font-size: 15px;
        color: rgba(255, 255, 255, 0.6);
        margin: 0;
        max-width: 420px;
        line-height: 1.55;
      }
      .navi-land-cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        padding: 15px 32px;
        border-radius: 12px;
        font-size: 15px;
        font-weight: 700;
        text-decoration: none;
        color: var(--v500);
        background: white;
        border: none;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .navi-land-cta-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
      }
      .navi-land-cta-hint {
        font-family: var(--ff-mono);
        font-size: 10px;
        color: rgba(255, 255, 255, 0.35);
        letter-spacing: 0.06em;
        margin: 0;
      }

      .navi-land-footer {
        border-top: 1.5px solid #F0EEF8;
        padding: 22px var(--nl-pad);
      }
      .navi-land-footer-inner {
        max-width: 1100px;
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      }
      .navi-land-footer-brand { display: flex; align-items: center; gap: 8px; }
      .navi-land-footer-copy {
        font-family: var(--ff-mono);
        font-size: 10px;
        color: var(--faint);
        margin: 0;
      }

      @media (max-width: 768px) {
        .navi-land-hero-grid {
          grid-template-columns: 1fr;
          padding: 40px var(--nl-pad) 48px;
          min-height: auto;
        }
        .navi-land-hero-left { padding-right: 0; }
        .navi-land-hero-right { display: none !important; }
        .navi-land-hero-h1 { font-size: 34px; }
        .navi-land-pain-grid { grid-template-columns: 1fr; }
        .navi-land-feat-pills { gap: 8px; }
        .navi-land-feat-row {
          grid-template-columns: 36px 1fr;
        }
        .navi-land-feat-desc { display: none; }
        .navi-land-cta-inner {
          padding: 40px 24px;
          border-radius: 16px;
        }
        .navi-land-cta-h2 { font-size: 28px; }
        .navi-land-footer { padding: 20px var(--nl-pad); }
        .navi-land-footer-copy { display: none; }
      }
    `}} />
  </div>
);

export default Welcome;
