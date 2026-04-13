import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check } from 'lucide-react';
import NaviLogo from '../components/NaviLogo.jsx';
import NaviWordmark from '../components/NaviWordmark.jsx';

/* ── WhatsApp Mockup ──────────────────────────────────────────────── */

const MESSAGES = [
  { role: 'user', text: 'Tenho interesse em começar, mas nunca fiz luta nenhuma',              delay: 300  },
  { role: 'bot',  text: 'Sem problema, nossa turma iniciante é feita pra isso! Você prefere treinar de manhã ou à noite?', delay: 1600 },
  { role: 'user', text: 'De manhã',                                                            delay: 3000 },
  { role: 'bot',  text: 'Temos turma às 8h. Quer vir experimentar uma aula gratuita?',        delay: 4200 },
  { role: 'user', text: 'Quero sim!',                                                          delay: 5600 },
  { role: 'bot',  text: 'Confirmo sua vaga pra segunda às 8h? 🥋',                            delay: 6800 },
  { role: 'user', text: 'Pode confirmar!',                                                     delay: 8200 },
  { role: 'bot',  text: 'Ótimo! Te esperamos na segunda 💪',                                   delay: 9400 },
];

const getTime = (offsetMinutes) => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - offsetMinutes);
  return now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

function WhatsAppMockup() {
  const [visibleMessages, setVisibleMessages] = useState([]);
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    const timers = [];

    const run = () => {
      MESSAGES.forEach((msg, i) => {
        if (msg.role === 'bot') {
          timers.push(setTimeout(() => setTyping(true), msg.delay - 800));
          timers.push(setTimeout(() => {
            setTyping(false);
            setVisibleMessages(prev => [...prev, { ...msg, idx: i }]);
          }, msg.delay));
        } else {
          timers.push(setTimeout(() => {
            setVisibleMessages(prev => [...prev, { ...msg, idx: i }]);
          }, msg.delay));
        }
      });
    };

    run();
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (visibleMessages.length === MESSAGES.length) {
      const timer = setTimeout(() => {
        setVisibleMessages([]);
        setTyping(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [visibleMessages]);

  return (
    <div className="wapp-mockup">
      {/* Header */}
      <div className="wapp-header">
        <div className="wapp-avatar">N</div>
        <div className="wapp-header-info">
          <div className="wapp-name">Nave — Academia</div>
          <div className="wapp-status">
            <span className="wapp-online-dot" />
            <span className="wapp-online-text">online agora</span>
          </div>
        </div>
        <div className="wapp-ai-badge">IA</div>
      </div>

      {/* Messages */}
      <div className="wapp-body">
        {visibleMessages.map((msg, i) => (
          <div key={`${msg.idx}-${i}`} className={`wapp-msg ${msg.role}`}>
            <div
              className="wapp-bubble"
              data-time={getTime(MESSAGES.length - msg.idx)}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {typing && (
          <div className="wapp-msg bot">
            <div className="wapp-bubble wapp-typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}

        {visibleMessages.length === MESSAGES.length && (
          <div className="wapp-result-badge">
            Experimental agendada
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="wapp-footer">
        <div className="wapp-input-mock">Digite uma mensagem</div>
        <div className="wapp-send-btn">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </div>
      </div>
    </div>
  );
}

/* ── Constants ───────────────────────────────────────────────────── */

const FUNIL_STEPS = ['Novo', 'Experimental', 'Não compareceu', 'Aguardando decisão', 'Matrícula'];

function KanbanTag({ children }) {
  return <span className="navi-lp-kanban-tag">{children}</span>;
}

const POSICIONAMENTO_ITENS = [
  'Todo lead seja bem atendido',
  'Toda conversa tenha continuidade',
  'Todo interessado seja acompanhado',
  'Toda oportunidade seja aproveitada',
];

/* ── Page ────────────────────────────────────────────────────────── */

const Welcome = () => {
  useEffect(() => {
    const nodes = document.querySelectorAll('.navi-lp-reveal');
    if (!nodes.length || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((el) => el.classList.add('navi-lp-reveal--in'));
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('navi-lp-reveal--in');
        });
      },
      { threshold: 0.06, rootMargin: '0px 0px -32px 0px' },
    );
    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
  <div className="navi-lp">
    <a href="#conteudo-principal" className="navi-lp-skip">
      Ir para o conteúdo
    </a>

    <nav className="navi-lp-nav" aria-label="Principal">
      <div className="navi-lp-nav-inner">
        <Link to="/" className="navi-lp-nav-brand">
          <NaviLogo size={26} />
          <NaviWordmark fontSize={20} />
        </Link>
        <div className="navi-lp-nav-cta">
          <Link to="/login" className="navi-lp-btn-nav-ghost">Entrar</Link>
          <Link to="/cadastro" className="navi-lp-btn-nav-primary">Testar grátis</Link>
        </div>
      </div>
    </nav>

    <main id="conteudo-principal">

      {/* ── HERO ── */}
      <section className="navi-lp-hero" aria-labelledby="navi-lp-hero-title">
        <div className="navi-lp-hero-mesh" aria-hidden="true">
          <span className="navi-lp-blob navi-lp-blob--a" />
          <span className="navi-lp-blob navi-lp-blob--b" />
          <span className="navi-lp-blob navi-lp-blob--c" />
        </div>
        <div className="navi-lp-hero-grid">
          <div className="navi-lp-hero-left">
            <span className="navi-lp-hero-badge">
              <span className="navi-lp-badge-dot" aria-hidden="true" />
              Feito para academias e estúdios fitness
            </span>
            <h1 id="navi-lp-hero-title" className="navi-lp-hero-h1">
              Pare de perder alunos por causa de atendimento ruim{' '}
              <span className="navi-lp-hero-h1-accent">no WhatsApp</span>
            </h1>
            <Link to="/cadastro" className="navi-lp-btn-hero">
              Quero testar grátis
              <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
            </Link>
            <p className="navi-lp-hero-hint">
              Teste grátis por 14 dias · Sem cartão de crédito · Cancele quando quiser
            </p>
          </div>
          <div className="navi-lp-hero-right">
            <span className="navi-lp-mock-blob" aria-hidden="true" />
            <div className="navi-lp-mock-wrap">
              <WhatsAppMockup />
            </div>
            <p className="wapp-caption">Conversa real simulada em tempo real</p>
          </div>
        </div>
      </section>

      {/* ── GALLERY ── */}
      <section className="navi-lp-band navi-lp-band--gallery navi-lp-reveal" aria-label="Estúdios e academias">
        <div className="navi-lp-inner">
          <div className="navi-lp-gallery-mesh" aria-hidden="true">
            <span className="navi-lp-blob navi-lp-blob--g1" />
            <span className="navi-lp-blob navi-lp-blob--g2" />
          </div>
          <div className="navi-lp-gallery">
            <figure className="navi-lp-gallery-item">
              <img src="/landing/ballet-studio.png" alt="Aula de ballet em estúdio de dança"
                width={640} height={400} loading="lazy" decoding="async" />
            </figure>
            <figure className="navi-lp-gallery-item">
              <img src="/landing/pilates-studio.png" alt="Estúdio de Pilates com reformers e espelhos iluminados"
                width={960} height={400} loading="lazy" decoding="async" />
            </figure>
            <figure className="navi-lp-gallery-item">
              <img src="/landing/instructor-wellness.png" alt="Profissional em estúdio de atividade física e bem-estar"
                width={640} height={400} loading="lazy" decoding="async" />
            </figure>
          </div>
        </div>
      </section>

      {/* ── PILLAR 01 ── */}
      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-s1">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
            <span className="navi-lp-dec-num" aria-hidden="true">01</span>
            <h2 id="navi-lp-s1" className="navi-lp-h2">
              1. Atendimento que inicia o relacionamento (24h)
            </h2>
            <ul className="navi-lp-list">
              <li>Responde em segundos, a qualquer hora</li>
              <li>Comunicação profissional, amigável e consistente</li>
              <li>Conduz a conversa com técnica de vendas de verdade</li>
              <li>Entende o momento do lead e faz as perguntas certas</li>
              <li>Cria valor antes de falar de preço</li>
              <li>Leva naturalmente até a aula experimental</li>
            </ul>
            <p className="navi-lp-accent-line">O primeiro contato já gera conexão — não só resposta</p>
          </div>
        </div>
      </section>

      {/* ── PILLAR 02 ── */}
      <section className="navi-lp-band navi-lp-reveal" aria-labelledby="navi-lp-s2">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
            <span className="navi-lp-dec-num" aria-hidden="true">02</span>
            <h2 id="navi-lp-s2" className="navi-lp-h2">
              2. Acompanhamento que transforma interesse em matrícula
            </h2>
            <p className="navi-lp-p">Cada lead evolui dentro de um funil claro:</p>
            <div className="navi-lp-funnel" role="list">
              {FUNIL_STEPS.map((step, i) => (
                <React.Fragment key={step}>
                  {i > 0 && <span className="navi-lp-funnel-arrow" aria-hidden>→</span>}
                  <span className="navi-lp-funnel-chip" role="listitem">{step}</span>
                </React.Fragment>
              ))}
            </div>
            <p className="navi-lp-p">O Nave não "responde e esquece" — ele acompanha</p>
            <p className="navi-lp-p">Alertas inteligentes como:</p>
            <div className="navi-lp-alert">
              <p className="navi-lp-alert-text">"Esse lead fez aula há 3 dias e ainda não fechou"</p>
            </div>
            <p className="navi-lp-p">Follow-up no momento certo, com mensagem certa</p>
            <p className="navi-lp-accent-line">Você continua presente até o aluno tomar decisão</p>
          </div>
        </div>
      </section>

      {/* ── PILLAR 03 ── */}
      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-s3">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
            <span className="navi-lp-dec-num" aria-hidden="true">03</span>
            <h2 id="navi-lp-s3" className="navi-lp-h2">
              3. Relacionamento com inteligência (antes e depois da matrícula)
            </h2>
            <ul className="navi-lp-list">
              <li>Histórico completo de cada conversa</li>
              <li>Entendimento das principais objeções</li>
              <li>Visão clara do comportamento dos leads</li>
              <li>Base para melhorar comunicação e retenção</li>
            </ul>
            <p className="navi-lp-accent-line">
              Você deixa de ter conversas soltas e passa a construir relacionamento
            </p>
          </div>
        </div>
      </section>

      {/* ── PERSONALIZAÇÃO ── */}
      <section className="navi-lp-band navi-lp-reveal" aria-labelledby="navi-lp-s4">
        <div className="navi-lp-inner">
          <div className="navi-lp-card navi-lp-card--split">
            <div>
              <h2 id="navi-lp-s4" className="navi-lp-h2">
                Personalização inteligente em minutos
              </h2>
              <p className="navi-lp-p">Em cerca de 15 minutos, o Nave aprende:</p>
            </div>
            <ul className="navi-lp-list">
              <li>Seu tom de voz</li>
              <li>Seus planos e preços</li>
              <li>Seus horários</li>
              <li>Sua forma de trabalhar</li>
            </ul>
            <p className="navi-lp-accent-line navi-lp-accent-line--full">
              Cada conversa soa como alguém da sua equipe atendendo
            </p>
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTO ── */}
      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-label="Depoimento de academia parceira">
        <div className="navi-lp-inner">
          <div className="navi-lp-social-grid">
            <div className="navi-lp-social-quote">
              <blockquote className="navi-lp-quote">
                <p>
                  "O Nave elevou completamente o nível do nosso atendimento. Hoje a gente converte mais,
                  acompanha melhor e não perde mais contato por falta de resposta."
                </p>
              </blockquote>
              <p className="navi-lp-quote-by">— Gracie Barra Lagoa da Prata</p>
            </div>
            <figure className="navi-lp-social-photo">
              <img src="/landing/martial-arts-class.png"
                alt="Aula em academia de artes marciais, instrutor e alunos no tatame"
                width={960} height={600} loading="lazy" decoding="async" />
            </figure>
          </div>
          <div className="navi-lp-mid-cta">
            <Link to="/cadastro" className="navi-lp-btn-mid">
              Quero testar grátis
              <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
            </Link>
            <p className="navi-lp-mid-cta-hint">14 dias grátis · Sem cartão · Cancele quando quiser</p>
          </div>
        </div>
      </section>

      {/* ── PROBLEMA ── */}
      <section className="navi-lp-band navi-lp-band--dark navi-lp-reveal" aria-labelledby="navi-lp-problema">
        <div className="navi-lp-inner navi-lp-inner--narrow">
          <h2 id="navi-lp-problema" className="navi-lp-h2 navi-lp-h2--on-dark">
            O problema não é só atendimento.
          </h2>
          <p className="navi-lp-sub-dark">É o que acontece depois da primeira mensagem.</p>
          <ul className="navi-lp-list navi-lp-list--dark">
            <li>O lead pergunta… e some</li>
            <li>Faz aula… e ninguém chama</li>
            <li>Demonstra interesse… e esfria</li>
          </ul>
        </div>
      </section>

      {/* ── POSICIONAMENTO ── */}
      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-pos-head">
        <div className="navi-lp-inner navi-lp-inner--prose">
          <h2 id="navi-lp-pos-head" className="navi-lp-h2">
            O Nave não deixa o relacionamento parar.
          </h2>
          <p className="navi-lp-p">Ele garante que:</p>
          <ul className="navi-lp-checklist">
            {POSICIONAMENTO_ITENS.map((text) => (
              <li key={text}>
                <Check size={16} strokeWidth={2.5} color="#5B3FBF" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── FECHAMENTO ── */}
      <section className="navi-lp-band navi-lp-reveal" aria-labelledby="navi-lp-fechamento-head">
        <div className="navi-lp-inner navi-lp-inner--narrow">
          <h2 id="navi-lp-fechamento-head" className="navi-lp-h2">
            Chega de tratar lead como conversa solta.
          </h2>
          <p className="navi-lp-p">
            Com o Nave, cada contato vira um relacionamento estruturado, que aumenta suas chances de matrícula.
          </p>
          <p className="navi-lp-p">
            Teste agora e veja a diferença nas suas conversas e no acompanhamento dos seus leads
          </p>
          <p className="navi-lp-p">
            Configure em poucos minutos e comece a evoluir seu atendimento hoje.
          </p>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="navi-lp-final-cta navi-lp-reveal" aria-labelledby="navi-lp-cta-final-title">
        <span className="navi-lp-final-circle navi-lp-final-circle--a" aria-hidden="true" />
        <span className="navi-lp-final-circle navi-lp-final-circle--b" aria-hidden="true" />
        <div className="navi-lp-final-inner">
          <h2 id="navi-lp-cta-final-title" className="navi-lp-sr-only">CTA final</h2>
          <Link to="/cadastro" className="navi-lp-btn-final">
            Quero começar meu teste grátis de 14 dias
            <ArrowRight size={20} strokeWidth={2.4} aria-hidden />
          </Link>
          <p className="navi-lp-final-hint">Sem compromisso • Cancelamento a qualquer momento</p>
        </div>
      </section>
    </main>

    <footer className="navi-lp-footer">
      <div className="navi-lp-footer-inner">
        <div className="navi-lp-footer-brand">
          <NaviLogo size={20} variant="white" />
          <NaviWordmark fontSize={16} variant="light" />
        </div>
        <p className="navi-lp-footer-copy">
          <span>© 2026 Nave</span>
          <span className="navi-lp-footer-sep" aria-hidden>·</span>
          <a href="https://navefit.com" className="navi-lp-footer-link" target="_blank" rel="noopener noreferrer">navefit.com</a>
          <span className="navi-lp-footer-sep" aria-hidden>·</span>
          <a href="https://www.instagram.com/navefit/" className="navi-lp-footer-link" target="_blank" rel="noopener noreferrer">@navefit</a>
          <span className="navi-lp-footer-sep" aria-hidden>·</span>
          <Link to="/login" className="navi-lp-footer-link">Entrar</Link>
          <span className="navi-lp-footer-sep" aria-hidden>·</span>
          <span>Todos os direitos reservados</span>
        </p>
      </div>
    </footer>

    <style dangerouslySetInnerHTML={{
      __html: `
      @keyframes navi-lp-fade-up {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      /* ── Root ── */
      .navi-lp {
        --nl-pad: clamp(20px, 4vw, 48px);
        --lp-max: 1100px;
        --lp-prose: 42rem;
        --lp-dark: #0f0a1e;
        --lp-light: #f8f7ff;
        --lp-violet: #5B3FBF;
        --lp-violet-dark: #4a32a0;
        --lp-pill-bg: #f0ebff;
        --lp-neon: #B14EFF;
        min-height: 100vh;
        background: #ffffff;
        color: var(--ink);
        font-family: var(--ff-ui);
      }

      /* ── Accessibility ── */
      .navi-lp-skip {
        position: absolute; left: -9999px; top: auto;
        width: 1px; height: 1px; overflow: hidden;
      }
      .navi-lp-skip:focus {
        position: fixed; left: 12px; top: 12px; z-index: 200;
        width: auto; height: auto; padding: 10px 16px;
        background: var(--v500); color: white;
        font-weight: 700; font-size: 14px;
        border-radius: 8px; text-decoration: none;
      }
      .navi-lp-sr-only {
        position: absolute; width: 1px; height: 1px;
        padding: 0; margin: -1px; overflow: hidden;
        clip: rect(0,0,0,0); white-space: nowrap; border: 0;
      }

      /* ── Focus ── */
      .navi-lp a:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v500);
      }
      .navi-lp-nav-brand:focus-visible { border-radius: 12px; }
      .navi-lp-btn-nav-primary:focus-visible,
      .navi-lp-btn-hero:focus-visible,
      .navi-lp-btn-mid:focus-visible,
      .navi-lp-btn-final:focus-visible {
        border-radius: 100px;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v500);
      }

      /* ── Reveal ── */
      .navi-lp-reveal {
        opacity: 0; transform: translateY(24px);
        transition: opacity 0.6s ease, transform 0.6s ease;
      }
      .navi-lp-reveal--in { opacity: 1; transform: translateY(0); }

      /* ── Navbar ── */
      .navi-lp-nav {
        position: sticky; top: 0; z-index: 100;
        min-height: 56px; display: flex; align-items: center;
        padding: 8px var(--nl-pad);
        background: rgba(255,255,255,0.92);
        backdrop-filter: saturate(180%) blur(16px);
        -webkit-backdrop-filter: saturate(180%) blur(16px);
        border-bottom: 0.5px solid rgba(0,0,0,0.06);
      }
      .navi-lp-nav-inner {
        max-width: var(--lp-max); width: 100%; margin: 0 auto;
        display: flex; align-items: center;
        justify-content: space-between; gap: 12px;
      }
      .navi-lp-nav-brand {
        display: flex; align-items: center; gap: 10px;
        text-decoration: none; color: inherit; flex-shrink: 0;
      }
      .navi-lp-nav-cta { display: flex; align-items: center; gap: 10px; }
      .navi-lp-btn-nav-ghost {
        display: inline-flex; align-items: center;
        padding: 8px 16px; min-height: 40px;
        border-radius: 100px; font-size: 14px; font-weight: 500;
        text-decoration: none; color: #6b7280; transition: color 0.15s ease;
      }
      .navi-lp-btn-nav-ghost:hover { color: var(--ink); }
      .navi-lp-btn-nav-primary {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 8px 20px; min-height: 40px;
        border-radius: 100px; font-size: 14px; font-weight: 600;
        text-decoration: none; color: white; background: var(--lp-dark);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-nav-primary:hover { background: #1f1840; transform: translateY(-1px); }
      @media (max-width: 520px) {
        .navi-lp-btn-nav-ghost { display: none !important; }
        .navi-lp-btn-nav-primary { font-size: 13px; padding: 8px 14px; }
      }

      /* ── Hero ── */
      .navi-lp-hero { position: relative; overflow: hidden; background: #fff; }
      .navi-lp-hero-mesh {
        position: absolute; inset: 0;
        pointer-events: none; z-index: 0; overflow: hidden;
      }
      .navi-lp-blob {
        position: absolute; border-radius: 50%;
        filter: blur(80px); pointer-events: none;
      }
      .navi-lp-blob--a {
        width: min(420px,80vw); height: min(420px,80vw);
        background: radial-gradient(circle, rgba(189,176,238,0.65) 0%, rgba(123,99,212,0.18) 55%, transparent 72%);
        top: -15%; right: -8%; opacity: 0.4;
      }
      .navi-lp-blob--b {
        width: min(320px,70vw); height: min(320px,70vw);
        background: radial-gradient(circle, rgba(240,112,112,0.28) 0%, transparent 68%);
        bottom: -5%; left: -12%; opacity: 0.28;
      }
      .navi-lp-blob--c {
        width: min(240px,55vw); height: min(240px,55vw);
        background: radial-gradient(circle, rgba(91,63,191,0.3) 0%, transparent 65%);
        top: 40%; right: 24%; opacity: 0.22;
      }
      .navi-lp-blob--g1 {
        width: 70%; height: 140%; left: -20%; top: -35%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(189,176,238,0.35) 0%, transparent 68%);
        filter: blur(56px); opacity: 0.55;
      }
      .navi-lp-blob--g2 {
        width: 55%; height: 100%; right: -18%; bottom: -40%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(240,112,112,0.18) 0%, transparent 70%);
        filter: blur(52px); opacity: 0.6;
      }

      .navi-lp-hero-grid {
        position: relative; z-index: 1;
        max-width: var(--lp-max); margin: 0 auto;
        padding: clamp(28px,3.5vw,56px) var(--nl-pad) clamp(32px,4vw,64px);
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        gap: clamp(24px,3vw,52px);
      }

      .navi-lp-hero-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 5px 12px; margin-bottom: 20px;
        background: var(--lp-pill-bg); color: var(--lp-violet);
        border-radius: 100px; font-size: 12px; font-weight: 600;
        letter-spacing: -0.01em;
        animation: navi-lp-fade-up 0.4s ease both;
      }
      .navi-lp-badge-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--lp-violet); flex-shrink: 0; display: inline-block;
      }
      .navi-lp-hero-h1 {
        font-family: var(--ff-serif);
        font-weight: 700;
        font-size: clamp(28px,3.5vw,52px);
        letter-spacing: -0.03em;
        line-height: 1.1;
        color: var(--ink);
        margin: 0 0 32px;
        animation: navi-lp-fade-up 0.45s 0.05s ease both;
      }
      .navi-lp-hero-h1-accent {
        font-family: var(--ff-serif);
        font-style: italic; font-weight: 700;
        color: var(--lp-violet);
      }

      /* ── Hero CTA ── */
      .navi-lp-btn-hero {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; width: 100%; max-width: 280px;
        min-height: 48px; padding: 12px 24px;
        border-radius: 100px; font-size: 15px; font-weight: 700;
        text-decoration: none; color: white;
        background: var(--lp-violet);
        box-shadow: 0 6px 22px rgba(91,63,191,0.28);
        transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.2s ease;
        animation: navi-lp-fade-up 0.45s 0.1s ease both;
      }
      .navi-lp-btn-hero:hover {
        background: var(--lp-violet-dark);
        transform: translateY(-2px);
        box-shadow: 0 8px 24px rgba(91,63,191,0.3), 0 0 32px rgba(177,78,255,0.2);
      }
      .navi-lp-btn-hero:active { transform: scale(0.98); }
      .navi-lp-hero-hint {
        margin: 12px 0 0; font-size: 11px; letter-spacing: 0.02em;
        color: #9ca3af; line-height: 1.6;
        animation: navi-lp-fade-up 0.45s 0.15s ease both;
      }

      /* ── Hero right ── */
      .navi-lp-hero-right {
        position: relative; z-index: 1;
        animation: navi-lp-fade-up 0.5s 0.1s ease both;
        display: flex; flex-direction: column; align-items: center;
      }
      .navi-lp-mock-blob {
        position: absolute; width: 88%; height: 78%;
        left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        border-radius: 45% 55% 48% 52% / 52% 48% 54% 46%;
        background: radial-gradient(
          ellipse 80% 70% at 35% 30%,
          rgba(189,176,238,0.4) 0%,
          rgba(91,63,191,0.12) 70%,
          transparent 100%
        );
        filter: blur(36px); z-index: 0; pointer-events: none;
      }
      .navi-lp-mock-wrap {
        position: relative; z-index: 1;
        border-radius: 24px; padding: 1.5px;
        background: linear-gradient(135deg, rgba(189,176,238,0.8) 0%, rgba(91,63,191,0.3) 50%, rgba(123,99,212,0.55) 100%);
        box-shadow:
          0 0 0 1px rgba(177,78,255,0.2),
          0 0 24px rgba(177,78,255,0.08),
          0 20px 56px rgba(0,0,0,0.14);
      }

      /* ── WhatsApp Mockup ── */
      .wapp-mockup {
        background: #ECE5DD;
        border-radius: 22px;
        overflow: hidden;
        width: 100%;
        max-width: 300px;
        min-width: 240px;
      }

      /* Header */
      .wapp-header {
        background: #075E54;
        padding: 10px 14px;
        display: flex; align-items: center; gap: 10px;
      }
      .wapp-avatar {
        width: 34px; height: 34px; border-radius: 50%;
        background: var(--lp-violet);
        color: white; font-size: 14px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .wapp-header-info { flex: 1; min-width: 0; }
      .wapp-name {
        font-size: 13px; font-weight: 600; color: white; line-height: 1.2;
      }
      .wapp-status { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
      .wapp-online-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--lp-neon);
        box-shadow: 0 0 6px var(--lp-neon), 0 0 12px rgba(177,78,255,0.4);
        flex-shrink: 0; display: inline-block;
      }
      .wapp-online-text { font-size: 10px; color: var(--lp-neon); }
      .wapp-ai-badge {
        background: rgba(177,78,255,0.15);
        color: var(--lp-neon);
        border: 0.5px solid rgba(177,78,255,0.3);
        border-radius: 4px;
        font-size: 9px; font-weight: 700;
        padding: 2px 6px; letter-spacing: 0.05em;
        flex-shrink: 0;
      }

      /* Messages area */
      .wapp-body {
        padding: 10px 10px 6px;
        display: flex; flex-direction: column; gap: 5px;
        min-height: 200px; max-height: 280px;
        overflow-y: auto;
        background: #ECE5DD;
      }
      .wapp-body::-webkit-scrollbar { display: none; }

      /* Message row */
      .wapp-msg { display: flex; }
      .wapp-msg.user { justify-content: flex-end; }
      .wapp-msg.bot  { justify-content: flex-start; }

      @keyframes msg-in {
        from { opacity: 0; transform: translateY(6px) scale(0.97); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }

      .wapp-bubble {
        max-width: 82%;
        padding: 6px 10px;
        font-size: 11.5px;
        line-height: 1.5;
        position: relative;
        animation: msg-in 0.25s ease forwards;
      }
      .wapp-bubble::after {
        content: attr(data-time);
        display: block;
        font-size: 8.5px;
        color: rgba(0,0,0,0.35);
        text-align: right;
        margin-top: 2px;
      }
      .wapp-msg.user .wapp-bubble {
        background: #DCF8C6;
        color: #1a1a1a;
        border-radius: 10px 2px 10px 10px;
      }
      .wapp-msg.bot .wapp-bubble {
        background: white;
        color: #1a1a1a;
        border-radius: 2px 10px 10px 10px;
      }

      /* Typing */
      .wapp-typing {
        display: flex; align-items: center; gap: 4px;
        padding: 10px 12px;
        background: white;
        border-radius: 2px 10px 10px 10px;
        animation: msg-in 0.2s ease forwards;
      }
      .wapp-typing::after { display: none; }

      .typing-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: #999;
        animation: typing-bounce 1.2s infinite;
        flex-shrink: 0;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }

      @keyframes typing-bounce {
        0%, 60%, 100% { transform: scale(0.8); opacity: 0.4; }
        30% { transform: scale(1.1); opacity: 1; }
      }

      /* Result badge */
      .wapp-result-badge {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        background: rgba(37,211,102,0.12);
        border: 0.5px solid rgba(37,211,102,0.3);
        color: #128c3e;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 11px; font-weight: 600;
        margin: 2px 0;
        animation: badge-in 0.4s ease forwards;
      }
      .wapp-result-badge::before {
        content: '';
        width: 6px; height: 6px; border-radius: 50%;
        background: #25D366;
        box-shadow: 0 0 6px #25D366;
        flex-shrink: 0;
      }
      @keyframes badge-in {
        from { opacity: 0; transform: scale(0.95); }
        to   { opacity: 1; transform: scale(1); }
      }

      /* Footer */
      .wapp-footer {
        background: #f0f0f0;
        padding: 7px 10px;
        display: flex; align-items: center; gap: 7px;
        border-top: 0.5px solid rgba(0,0,0,0.08);
      }
      .wapp-input-mock {
        flex: 1; background: white; border-radius: 20px;
        padding: 6px 12px; font-size: 11px; color: #aaa;
      }
      .wapp-send-btn {
        width: 30px; height: 30px; border-radius: 50%;
        background: #25D366; color: white;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }

      /* Caption */
      .wapp-caption {
        font-size: 11px; color: #9ca3af;
        margin-top: 12px; font-style: italic;
        text-align: center;
        position: relative; z-index: 1;
      }

      /* ── Gallery ── */
      .navi-lp-band--gallery {
        position: relative; overflow: hidden; background: var(--lp-light);
      }
      .navi-lp-gallery-mesh {
        position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden;
      }
      .navi-lp-band--gallery .navi-lp-inner { position: relative; z-index: 1; }
      .navi-lp-gallery {
        display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; align-items: stretch;
      }
      .navi-lp-gallery-item {
        margin: 0; border-radius: 16px; overflow: hidden;
        border: 0.5px solid rgba(91,63,191,0.1);
        box-shadow: 0 4px 20px rgba(91,63,191,0.07);
      }
      .navi-lp-gallery-item img {
        display: block; width: 100%; height: 100%;
        min-height: 160px; object-fit: cover; aspect-ratio: 4/3;
      }

      /* ── Section bands ── */
      .navi-lp-band {
        padding: clamp(64px,9vw,104px) var(--nl-pad); background: #fff;
      }
      .navi-lp-band--soft { background: var(--lp-light); }
      .navi-lp-band--dark {
        background: var(--lp-dark); color: rgba(255,255,255,0.92);
        position: relative; overflow: hidden;
      }
      .navi-lp-band--dark::before {
        content: ''; position: absolute; inset: 0;
        background: radial-gradient(ellipse 80% 50% at 90% 10%, rgba(91,63,191,0.22), transparent 58%);
        pointer-events: none;
      }
      .navi-lp-band--dark .navi-lp-inner { position: relative; z-index: 1; }

      /* ── Inner ── */
      .navi-lp-inner { max-width: var(--lp-max); margin: 0 auto; }
      .navi-lp-inner--prose,
      .navi-lp-inner--narrow {
        max-width: min(var(--lp-prose),100%);
        margin-left: auto; margin-right: auto;
      }

      /* ── Cards ── */
      .navi-lp-card {
        background: #fff; border: 0.5px solid rgba(0,0,0,0.08);
        border-radius: 16px; padding: clamp(28px,4vw,44px);
        box-shadow: 0 2px 16px rgba(18,16,42,0.04);
      }
      .navi-lp-band--soft .navi-lp-card { box-shadow: 0 4px 24px rgba(91,63,191,0.06); }
      .navi-lp-card .navi-lp-h2 { max-width: min(var(--lp-prose),100%); margin: 0 0 20px; }
      .navi-lp-card .navi-lp-p,
      .navi-lp-card .navi-lp-list,
      .navi-lp-card .navi-lp-accent-line { max-width: min(var(--lp-prose),100%); }
      .navi-lp-card--split .navi-lp-accent-line--full { max-width: none; }
      .navi-lp-card--split { display: grid; gap: 20px 40px; }
      @media (min-width: 768px) {
        .navi-lp-card--split {
          grid-template-columns: minmax(0,1fr) minmax(0,1fr); align-items: start;
        }
        .navi-lp-card--split .navi-lp-accent-line--full { grid-column: 1 / -1; }
      }

      /* ── Dec numbers ── */
      .navi-lp-dec-num {
        display: block; font-family: var(--ff-serif);
        font-weight: 700; font-size: clamp(48px,6vw,80px);
        color: var(--lp-pill-bg); line-height: 1;
        letter-spacing: -0.04em; margin-bottom: 8px; user-select: none;
      }

      /* ── Typography ── */
      .navi-lp-h2 {
        font-family: var(--ff-serif); font-weight: 700;
        font-size: clamp(24px,3.2vw,44px);
        letter-spacing: -0.02em; line-height: 1.1;
        color: var(--ink); margin: 0 0 20px;
      }
      .navi-lp-h2--on-dark { color: #fff; margin-bottom: 14px; }
      .navi-lp-sub-dark { font-size: 17px; color: rgba(255,255,255,0.65); margin: 0 0 28px; line-height: 1.55; }
      .navi-lp-p { font-size: clamp(14px,1.6vw,16px); color: #6b7280; line-height: 1.7; margin: 0 0 14px; }
      .navi-lp-list {
        list-style: none; padding: 0; margin: 0 0 24px;
        display: flex; flex-direction: column; gap: 10px;
        font-size: clamp(14px,1.6vw,16px); color: var(--ink2); line-height: 1.6;
      }
      .navi-lp-list li { padding-left: 1.4em; position: relative; }
      .navi-lp-list li::before {
        content: "→"; position: absolute; left: 0;
        color: var(--lp-violet); font-weight: 700;
      }
      .navi-lp-list--dark {
        list-style: none; padding: 0; margin: 0;
        font-size: 17px; color: rgba(255,255,255,0.85); gap: 14px;
      }
      .navi-lp-list--dark li { padding-left: 1.4em; }
      .navi-lp-list--dark li::before { content: "→"; color: var(--v200); }
      .navi-lp-accent-line {
        font-size: clamp(14px,1.6vw,16px); font-weight: 600;
        color: var(--v700); margin: 14px 0 0; line-height: 1.5;
      }

      /* ── Quote / Social ── */
      .navi-lp-social-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: clamp(20px,3vw,32px); align-items: stretch;
      }
      .navi-lp-social-quote {
        margin: 0; padding: clamp(28px,4vw,44px);
        background: #fff; border: 0.5px solid rgba(0,0,0,0.08);
        border-radius: 16px; box-shadow: 0 2px 16px rgba(18,16,42,0.04);
        display: flex; flex-direction: column; justify-content: center;
      }
      .navi-lp-social-photo {
        margin: 0; border-radius: 16px; overflow: hidden;
        border: 0.5px solid rgba(0,0,0,0.08);
        box-shadow: 0 2px 16px rgba(18,16,42,0.04);
        display: flex; min-height: 260px;
      }
      .navi-lp-social-photo img {
        display: block; width: 100%; height: 100%;
        min-height: 260px; object-fit: cover; object-position: center;
      }
      .navi-lp-quote { margin: 0; padding: 0; border: none; }
      .navi-lp-quote p {
        margin: 0; font-family: var(--ff-serif); font-style: italic;
        font-size: clamp(17px,2vw,21px); font-weight: 700;
        line-height: 1.55; color: var(--ink); letter-spacing: -0.02em;
      }
      .navi-lp-quote p::before {
        content: ""; display: block; width: 36px; height: 3px;
        border-radius: 99px;
        background: linear-gradient(90deg, var(--v500), var(--v200));
        margin-bottom: 20px;
      }
      .navi-lp-quote-by {
        margin: 18px 0 0; font-size: 14px; font-weight: 600;
        color: var(--v700); font-style: normal; line-height: 1.45;
      }
      .navi-lp-mid-cta {
        margin-top: 36px; display: flex; flex-direction: column;
        align-items: center; gap: 10px; text-align: center;
      }
      .navi-lp-btn-mid {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; min-height: 52px; padding: 13px 30px;
        border-radius: 100px; font-size: 15px; font-weight: 700;
        text-decoration: none; color: white; background: var(--lp-violet);
        box-shadow: 0 6px 22px rgba(91,63,191,0.28);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-mid:hover { background: var(--lp-violet-dark); transform: translateY(-2px); }
      .navi-lp-mid-cta-hint { margin: 0; font-size: 12px; letter-spacing: 0.04em; color: #9ca3af; }

      /* ── Funnel ── */
      .navi-lp-funnel {
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 8px 6px; margin: 14px 0 24px;
      }
      .navi-lp-funnel-chip {
        display: inline-flex; align-items: center;
        padding: 7px 12px; border-radius: 100px;
        background: var(--lp-pill-bg); border: 0.5px solid rgba(91,63,191,0.15);
        font-size: 12px; font-weight: 600; color: var(--v700); white-space: nowrap;
      }
      .navi-lp-funnel-arrow { color: var(--faint); font-size: 13px; font-weight: 600; }

      /* ── Alert ── */
      .navi-lp-alert {
        margin: 6px 0 18px; padding: 14px 18px;
        border-radius: 12px; background: var(--c50);
        border: 0.5px solid rgba(240,64,64,0.18);
      }
      .navi-lp-alert-text { margin: 0; font-size: 14px; font-weight: 600; color: var(--ink); line-height: 1.5; }

      /* ── Checklist ── */
      .navi-lp-checklist {
        list-style: none; padding: 0; margin: 16px 0 0;
        display: flex; flex-direction: column; gap: 14px;
      }
      .navi-lp-checklist li {
        display: flex; align-items: flex-start; gap: 10px;
        font-size: clamp(14px,1.6vw,16px); font-weight: 600;
        color: var(--ink); line-height: 1.45;
      }
      .navi-lp-checklist li svg { flex-shrink: 0; margin-top: 2px; }

      /* ── Final CTA ── */
      .navi-lp-final-cta {
        background: var(--lp-violet);
        padding: clamp(64px,9vw,104px) var(--nl-pad);
        position: relative; overflow: hidden; text-align: center;
      }
      .navi-lp-final-circle {
        position: absolute; border-radius: 50%;
        background: rgba(255,255,255,0.05); pointer-events: none;
      }
      .navi-lp-final-circle--a { width: 480px; height: 480px; top: -180px; right: -140px; }
      .navi-lp-final-circle--b { width: 360px; height: 360px; bottom: -140px; left: -100px; }
      .navi-lp-final-inner {
        position: relative; z-index: 1;
        max-width: var(--lp-max); margin: 0 auto;
        display: flex; flex-direction: column; align-items: center; gap: 20px;
      }
      .navi-lp-btn-final {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; width: 100%; max-width: 420px; min-height: 56px;
        padding: 15px 36px; border-radius: 100px;
        font-size: 16px; font-weight: 700; text-decoration: none;
        color: var(--lp-violet); background: #fff;
        box-shadow: 0 8px 28px rgba(0,0,0,0.18);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .navi-lp-btn-final:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(0,0,0,0.24); }
      .navi-lp-final-hint { margin: 0; font-size: 12px; letter-spacing: 0.04em; color: rgba(255,255,255,0.5); }

      /* ── Footer ── */
      .navi-lp-footer { background: var(--lp-dark); padding: 26px var(--nl-pad); }
      .navi-lp-footer-inner {
        max-width: var(--lp-max); margin: 0 auto;
        display: flex; justify-content: space-between;
        align-items: center; flex-wrap: wrap; gap: 14px;
      }
      .navi-lp-footer-brand { display: flex; align-items: center; gap: 8px; }
      .navi-lp-footer-copy {
        font-family: var(--ff-mono); font-size: 10px;
        color: rgba(255,255,255,0.35); margin: 0;
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 6px 8px; justify-content: flex-end;
      }
      .navi-lp-footer-sep { color: rgba(255,255,255,0.15); user-select: none; }
      .navi-lp-footer-link {
        color: rgba(255,255,255,0.4); text-decoration: none;
        font-weight: 600; border-radius: 4px; transition: color 0.15s ease;
      }
      .navi-lp-footer-link:hover { color: rgba(255,255,255,0.85); }

      /* ── Responsive ── */
      @media (max-width: 900px) {
        .navi-lp-hero-grid { grid-template-columns: 1fr; }
        .navi-lp-hero-right { order: -1; max-width: 320px; margin: 0 auto; width: 100%; }
        .navi-lp-social-grid { grid-template-columns: 1fr; }
        .navi-lp-social-photo { min-height: 220px; }
        .navi-lp-social-photo img { min-height: 220px; }
      }
      @media (max-width: 768px) {
        .navi-lp-footer-copy { width: 100%; justify-content: flex-start; }
        .navi-lp-gallery { grid-template-columns: 1fr; }
        .navi-lp-gallery-item img { aspect-ratio: 16/10; min-height: 200px; }
        .navi-lp-dec-num { font-size: clamp(40px,10vw,60px); }
      }

      /* ── Reduced motion ── */
      @media (prefers-reduced-motion: reduce) {
        .navi-lp-reveal { opacity: 1; transform: none; transition: none; }
        .navi-lp-reveal--in { opacity: 1; transform: none; }
        .typing-dot { animation: none; opacity: 0.6; }
        .wapp-msg { animation: none; }
        .wapp-result-badge { animation: none; }
      }
    `,
    }}
    />
  </div>
  );
};

export default Welcome;
