import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, LogIn, MessageCircle } from 'lucide-react';
import NaviLogo from '../components/NaviLogo.jsx';
import NaviWordmark from '../components/NaviWordmark.jsx';

function KanbanTag({ children }) {
  return <span className="navi-lp-kanban-tag">{children}</span>;
}

/** Colunas alinhadas ao funil do produto (Pipeline). */
function ProductMock() {
  return (
    <div className="navi-lp-mock" aria-hidden>
      <div className="navi-lp-mock-top">
        <div className="navi-lp-mock-top-left">
          <MessageCircle size={18} color="white" strokeWidth={2.2} />
          <span className="navi-lp-mock-wa-label">WhatsApp + Nave</span>
        </div>
        <div className="navi-lp-mock-pills">
          <span className="navi-lp-mock-pill navi-lp-mock-pill--on">Funil</span>
          <span className="navi-lp-mock-pill">Atendimento</span>
        </div>
      </div>
      <div className="navi-lp-mock-stats">
        <div className="navi-lp-stat navi-lp-stat--vio">
          <span className="navi-lp-stat-num navi-lp-stat-num--vio">7</span>
          <span className="navi-lp-stat-lbl">Leads ativos</span>
        </div>
        <div className="navi-lp-stat navi-lp-stat--cor">
          <span className="navi-lp-stat-num navi-lp-stat-num--cor">3</span>
          <span className="navi-lp-stat-lbl">Em follow-up</span>
        </div>
        <div className="navi-lp-stat navi-lp-stat--ok">
          <span className="navi-lp-stat-num navi-lp-stat-num--ok">12</span>
          <span className="navi-lp-stat-lbl">Matriculados</span>
        </div>
      </div>
      <div className="navi-lp-mock-kanban-scroll">
        <div className="navi-lp-mock-kanban">
          <div className="navi-lp-kcol">
            <div className="navi-lp-kcol-title">Novo</div>
            <div className="navi-lp-kcard navi-lp-kcard--v">
              <div className="navi-lp-kname">Rafael M.</div>
              <KanbanTag>Jiu-Jitsu</KanbanTag>
            </div>
          </div>
          <div className="navi-lp-kcol">
            <div className="navi-lp-kcol-title">Experimental</div>
            <div className="navi-lp-kcard navi-lp-kcard--c">
              <div className="navi-lp-kname">Marina Costa</div>
              <KanbanTag>Sáb 10h</KanbanTag>
            </div>
          </div>
          <div className="navi-lp-kcol">
            <div className="navi-lp-kcol-title">Não compareceu</div>
            <div className="navi-lp-kcard navi-lp-kcard--miss">
              <div className="navi-lp-kname">Julia S.</div>
              <KanbanTag>Reagendar</KanbanTag>
            </div>
          </div>
          <div className="navi-lp-kcol">
            <div className="navi-lp-kcol-title">Aguardando decisão</div>
            <div className="navi-lp-kcard navi-lp-kcard--wait">
              <div className="navi-lp-kname">Pedro Lima</div>
              <KanbanTag>Pós-aula</KanbanTag>
            </div>
          </div>
          <div className="navi-lp-kcol">
            <div className="navi-lp-kcol-title">Matrícula</div>
            <div className="navi-lp-kcard navi-lp-kcard--g">
              <div className="navi-lp-kname">Ana R.</div>
              <KanbanTag>Plano mensal</KanbanTag>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const FUNIL_STEPS = ['Novo', 'Experimental', 'Não compareceu', 'Aguardando decisão', 'Matrícula'];

const POSICIONAMENTO_ITENS = [
  '✔ Todo lead seja bem atendido',
  '✔ Toda conversa tenha continuidade',
  '✔ Todo interessado seja acompanhado',
  '✔ Toda oportunidade seja aproveitada',
];

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
          <Link to="/login" className="navi-lp-btn-nav-ghost">
            <LogIn size={15} strokeWidth={2.4} aria-hidden />
            Entrar
          </Link>
          <Link to="/cadastro" className="navi-lp-btn-nav-primary">
            Quero testar grátis
          </Link>
        </div>
      </div>
    </nav>

    <main id="conteudo-principal">
      <section className="navi-lp-hero" aria-labelledby="navi-lp-hero-title">
        <div className="navi-lp-hero-mesh" aria-hidden="true">
          <span className="navi-lp-blob navi-lp-blob--a" />
          <span className="navi-lp-blob navi-lp-blob--b" />
          <span className="navi-lp-blob navi-lp-blob--c" />
        </div>
        <div className="navi-lp-hero-grid">
          <div className="navi-lp-hero-left">
            <h1 id="navi-lp-hero-title" className="navi-lp-hero-h1">
              Pare de perder alunos por causa de atendimento ruim{' '}
              <span className="navi-lp-hero-h1-accent">no WhatsApp</span>
            </h1>
            <p className="navi-lp-lead">O Nave é a plataforma de relacionamento para academias</p>
            <p className="navi-lp-hero-p">Da primeira mensagem até a matrícula, e além.</p>
            <p className="navi-lp-hero-p">
              Atende 24h, conduz com técnica de vendas e acompanha cada lead até se tornar aluno.
            </p>
            <ul className="navi-lp-hero-bullets">
              <li>👉 Sem depender de recepcionista</li>
              <li>👉 Sem deixar lead esfriar</li>
              <li>👉 Mais resultado com os leads que você já recebe</li>
            </ul>
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
              <ProductMock />
            </div>
          </div>
        </div>
      </section>

      <section className="navi-lp-band navi-lp-band--gallery navi-lp-reveal" aria-label="Estúdios e academias">
        <div className="navi-lp-inner">
          <div className="navi-lp-gallery-mesh" aria-hidden="true">
            <span className="navi-lp-blob navi-lp-blob--g1" />
            <span className="navi-lp-blob navi-lp-blob--g2" />
          </div>
          <div className="navi-lp-gallery">
            <figure className="navi-lp-gallery-item">
              <img
                src="/landing/ballet-studio.png"
                alt="Aula de ballet em estúdio de dança"
                width={640}
                height={400}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <figure className="navi-lp-gallery-item">
              <img
                src="/landing/pilates-studio.png"
                alt="Estúdio de Pilates com reformers e espelhos iluminados"
                width={960}
                height={400}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <figure className="navi-lp-gallery-item">
              <img
                src="/landing/instructor-wellness.png"
                alt="Profissional em estúdio de atividade física e bem-estar"
                width={640}
                height={400}
                loading="lazy"
                decoding="async"
              />
            </figure>
          </div>
        </div>
      </section>

      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-s1">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
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
            <p className="navi-lp-accent-line">👉 O primeiro contato já gera conexão — não só resposta</p>
          </div>
        </div>
      </section>

      <section className="navi-lp-band navi-lp-reveal" aria-labelledby="navi-lp-s2">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
            <h2 id="navi-lp-s2" className="navi-lp-h2">
              2. Acompanhamento que transforma interesse em matrícula
            </h2>
            <p className="navi-lp-p">Cada lead evolui dentro de um funil claro:</p>
            <div className="navi-lp-funnel" role="list">
              {FUNIL_STEPS.map((step, i) => (
                <React.Fragment key={step}>
                  {i > 0 && <span className="navi-lp-funnel-arrow" aria-hidden>→</span>}
                  <span className="navi-lp-funnel-chip" role="listitem">
                    {step}
                  </span>
                </React.Fragment>
              ))}
            </div>
            <p className="navi-lp-p">O Nave não “responde e esquece” — ele acompanha</p>
            <p className="navi-lp-p">Alertas inteligentes como:</p>
            <div className="navi-lp-alert">
              <p className="navi-lp-alert-text">👉 “Esse lead fez aula há 3 dias e ainda não fechou”</p>
            </div>
            <p className="navi-lp-p">Follow-up no momento certo, com mensagem certa</p>
            <p className="navi-lp-accent-line">👉 Você continua presente até o aluno tomar decisão</p>
          </div>
        </div>
      </section>

      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-s3">
        <div className="navi-lp-inner">
          <div className="navi-lp-card">
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
              👉 Você deixa de ter conversas soltas e passa a construir relacionamento
            </p>
          </div>
        </div>
      </section>

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
              👉 Cada conversa soa como alguém da sua equipe atendendo
            </p>
          </div>
        </div>
      </section>

      <section
        className="navi-lp-band navi-lp-band--soft navi-lp-reveal"
        aria-label="Depoimento de academia parceira"
      >
        <div className="navi-lp-inner">
          <div className="navi-lp-social-grid">
            <div className="navi-lp-social-quote">
              <blockquote className="navi-lp-quote">
                <p>
                  “O Nave elevou completamente o nível do nosso atendimento. Hoje a gente converte mais,
                  acompanha melhor e não perde mais contato por falta de resposta.”
                </p>
              </blockquote>
              <p className="navi-lp-quote-by">— Gracie Barra Lagoa da Prata</p>
            </div>
            <figure className="navi-lp-social-photo">
              <img
                src="/landing/martial-arts-class.png"
                alt="Aula em academia de artes marciais, instrutor e alunos no tatame"
                width={960}
                height={600}
                loading="lazy"
                decoding="async"
              />
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

      <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-labelledby="navi-lp-pos-head">
        <div className="navi-lp-inner navi-lp-inner--prose">
          <h2 id="navi-lp-pos-head" className="navi-lp-h2">
            O Nave não deixa o relacionamento parar.
          </h2>
          <p className="navi-lp-p">Ele garante que:</p>
          <ul className="navi-lp-checklist">
            {POSICIONAMENTO_ITENS.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="navi-lp-band navi-lp-reveal" aria-labelledby="navi-lp-fechamento-head">
        <div className="navi-lp-inner navi-lp-inner--narrow">
          <h2 id="navi-lp-fechamento-head" className="navi-lp-h2">
            Chega de tratar lead como conversa solta.
          </h2>
          <p className="navi-lp-p">
            Com o Nave, cada contato vira um relacionamento estruturado, que aumenta suas chances de
            matrícula.
          </p>
          <p className="navi-lp-p">
            Teste agora e veja a diferença nas suas conversas e no acompanhamento dos seus leads
          </p>
          <p className="navi-lp-p">
            Configure em poucos minutos e comece a evoluir seu atendimento hoje.
          </p>
        </div>
      </section>

      <section className="navi-lp-final-cta navi-lp-reveal" aria-labelledby="navi-lp-cta-final-title">
        <div className="navi-lp-final-inner">
          <h2 id="navi-lp-cta-final-title" className="navi-lp-sr-only">
            CTA final
          </h2>
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
          <NaviLogo size={20} />
          <NaviWordmark fontSize={16} />
        </div>
        <p className="navi-lp-footer-copy">
          <span>© 2026 Nave</span>
          <span className="navi-lp-footer-sep" aria-hidden>
            ·
          </span>
          <a
            href="https://navefit.com"
            className="navi-lp-footer-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            navefit.com
          </a>
          <span className="navi-lp-footer-sep" aria-hidden>
            ·
          </span>
          <a
            href="https://www.instagram.com/navefit/"
            className="navi-lp-footer-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            @navefit
          </a>
          <span className="navi-lp-footer-sep" aria-hidden>
            ·
          </span>
          <Link to="/login" className="navi-lp-footer-link">
            Entrar
          </Link>
          <span className="navi-lp-footer-sep" aria-hidden>
            ·
          </span>
          <span>Todos os direitos reservados</span>
        </p>
      </div>
    </footer>

    <style dangerouslySetInnerHTML={{
      __html: `
      @keyframes navi-lp-fade-up {
        from { opacity: 0; transform: translateY(12px); }
        to { opacity: 1; transform: translateY(0); }
      }

      .navi-lp {
        --nl-pad: clamp(20px, 4vw, 48px);
        --lp-max: 1100px;
        --lp-prose: 42rem;
        --lp-cream: #faf7f2;
        --lp-cream-mesh: #f4edfc;
        min-height: 100vh;
        background: var(--lp-cream);
        color: var(--ink);
        font-family: var(--ff-ui);
      }

      .navi-lp-skip {
        position: absolute;
        left: -9999px;
        top: auto;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
      .navi-lp-skip:focus {
        position: fixed;
        left: 12px;
        top: 12px;
        z-index: 200;
        width: auto;
        height: auto;
        padding: 10px 16px;
        background: var(--v500);
        color: white;
        font-weight: 700;
        font-size: 14px;
        border-radius: 8px;
        text-decoration: none;
      }

      .navi-lp-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }

      .navi-lp a:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v500);
      }
      .navi-lp-nav-brand:focus-visible {
        border-radius: 14px;
      }
      .navi-lp-btn-nav-primary:focus-visible,
      .navi-lp-btn-hero:focus-visible,
      .navi-lp-btn-mid:focus-visible {
        border-radius: 999px;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--v500), 0 6px 22px rgba(91, 63, 191, 0.3);
      }
      .navi-lp-btn-nav-ghost:focus-visible {
        border-radius: 999px;
        box-shadow: 0 0 0 2px var(--v50), 0 0 0 4px var(--v500);
      }
      .navi-lp-btn-final:focus-visible {
        border-radius: 999px;
        outline: none;
        box-shadow: 0 0 0 2px var(--v500), 0 0 0 5px white, 0 6px 24px rgba(0, 0, 0, 0.18);
      }

      .navi-lp-reveal {
        opacity: 0;
        transform: translateY(18px);
        transition: opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1), transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .navi-lp-reveal--in {
        opacity: 1;
        transform: translateY(0);
      }

      .navi-lp-hero {
        position: relative;
        overflow: hidden;
        background: linear-gradient(180deg, var(--lp-cream) 0%, #fffcf8 55%, var(--lp-cream) 100%);
      }
      .navi-lp-hero-mesh {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
      }
      .navi-lp-blob {
        position: absolute;
        border-radius: 50%;
        filter: blur(80px);
        pointer-events: none;
      }
      .navi-lp-blob--a {
        width: min(520px, 95vw);
        height: min(520px, 95vw);
        background: radial-gradient(circle, rgba(189, 176, 238, 0.95) 0%, rgba(123, 99, 212, 0.35) 50%, transparent 72%);
        top: -14%;
        right: -10%;
        opacity: 0.55;
      }
      .navi-lp-blob--b {
        width: min(400px, 80vw);
        height: min(400px, 80vw);
        background: radial-gradient(circle, rgba(240, 112, 112, 0.42) 0%, transparent 68%);
        bottom: -5%;
        left: -14%;
        opacity: 0.38;
      }
      .navi-lp-blob--c {
        width: min(300px, 65vw);
        height: min(300px, 65vw);
        background: radial-gradient(circle, rgba(91, 63, 191, 0.5) 0%, transparent 65%);
        top: 36%;
        right: 22%;
        opacity: 0.32;
      }
      .navi-lp-blob--g1 {
        width: 70%;
        height: 140%;
        left: -20%;
        top: -35%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(189, 176, 238, 0.4) 0%, transparent 68%);
        filter: blur(56px);
        opacity: 0.65;
      }
      .navi-lp-blob--g2 {
        width: 55%;
        height: 100%;
        right: -18%;
        bottom: -40%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(240, 112, 112, 0.22) 0%, transparent 70%);
        filter: blur(52px);
        opacity: 0.7;
      }

      .navi-lp-nav {
        position: sticky;
        top: 0;
        z-index: 100;
        min-height: 58px;
        display: flex;
        align-items: center;
        padding: 10px var(--nl-pad);
        background: rgba(250, 247, 242, 0.88);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border-bottom: 1px solid rgba(91, 63, 191, 0.08);
      }
      .navi-lp-nav-inner {
        max-width: var(--lp-max);
        width: 100%;
        margin: 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .navi-lp-nav-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        text-decoration: none;
        color: inherit;
        flex-shrink: 0;
      }
      .navi-lp-nav-cta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
      .navi-lp-btn-nav-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 18px;
        min-height: 44px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        text-decoration: none;
        color: var(--v500);
        background: var(--v50);
        border: none;
        transition: background 0.15s ease;
      }
      .navi-lp-btn-nav-ghost:hover { background: var(--v100); }
      .navi-lp-btn-nav-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 22px;
        min-height: 44px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        color: white;
        background: var(--v500);
        border: none;
        box-shadow: 0 2px 10px rgba(91, 63, 191, 0.28);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-nav-primary:hover {
        background: var(--v700);
        transform: translateY(-1px);
      }
      @media (max-width: 520px) {
        .navi-lp-btn-nav-ghost { display: none !important; }
        .navi-lp-btn-nav-primary { font-size: 12px; padding: 10px 14px; }
      }

      .navi-lp-hero-grid {
        position: relative;
        z-index: 1;
        max-width: var(--lp-max);
        margin: 0 auto;
        padding: clamp(32px, 6vw, 56px) var(--nl-pad) clamp(40px, 6vw, 64px);
        display: grid;
        grid-template-columns: 1fr 1fr;
        align-items: center;
        gap: clamp(24px, 4vw, 48px);
      }
      .navi-lp-hero-h1 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: clamp(28px, 4.2vw, 46px);
        letter-spacing: -0.03em;
        line-height: 1.12;
        color: var(--ink);
        margin: 0 0 20px;
        animation: navi-lp-fade-up 0.45s ease both;
      }
      .navi-lp-hero-h1-accent {
        font-family: var(--ff-ui);
        font-style: italic;
        font-weight: 800;
        color: var(--v500);
      }
      .navi-lp-lead {
        font-family: var(--ff-ui);
        font-style: normal;
        font-weight: 600;
        font-size: clamp(17px, 2vw, 20px);
        color: var(--v700);
        line-height: 1.45;
        margin: 0 0 16px;
        max-width: min(var(--lp-prose), 100%);
        animation: navi-lp-fade-up 0.45s 0.05s ease both;
      }
      .navi-lp-hero-p {
        font-size: 16px;
        color: var(--mid);
        line-height: 1.65;
        margin: 0 0 16px;
        max-width: min(var(--lp-prose), 100%);
        animation: navi-lp-fade-up 0.45s 0.1s ease both;
      }
      .navi-lp-hero-bullets {
        list-style: none;
        margin: 20px 0 28px;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 10px;
        font-size: 15px;
        font-weight: 500;
        color: var(--ink2);
        line-height: 1.5;
        animation: navi-lp-fade-up 0.45s 0.14s ease both;
      }
      .navi-lp-btn-hero {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        max-width: 320px;
        min-height: 52px;
        padding: 14px 28px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 700;
        text-decoration: none;
        color: white;
        background: var(--v500);
        border: none;
        box-shadow: 0 6px 22px rgba(91, 63, 191, 0.3);
        transition: background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
        animation: navi-lp-fade-up 0.45s 0.18s ease both;
      }
      .navi-lp-btn-hero:hover {
        background: var(--v700);
        transform: translateY(-2px);
        box-shadow: 0 10px 28px rgba(91, 63, 191, 0.35);
      }
      .navi-lp-btn-hero:active { transform: scale(0.98); }

      .navi-lp-hero-right {
        position: relative;
        z-index: 1;
        animation: navi-lp-fade-up 0.45s 0.08s ease both;
      }
      .navi-lp-mock-blob {
        position: absolute;
        width: 94%;
        height: 82%;
        left: 50%;
        top: 52%;
        transform: translate(-50%, -50%);
        border-radius: 45% 55% 48% 52% / 52% 48% 54% 46%;
        background: radial-gradient(
          ellipse 80% 70% at 35% 30%,
          rgba(255, 218, 185, 0.55) 0%,
          rgba(189, 176, 238, 0.42) 42%,
          rgba(91, 63, 191, 0.18) 78%,
          transparent 100%
        );
        filter: blur(40px);
        z-index: 0;
        pointer-events: none;
      }
      .navi-lp-hero-hint {
        margin: 12px 0 0;
        font-family: var(--ff-mono);
        font-size: 11px;
        letter-spacing: 0.05em;
        color: var(--faint);
        line-height: 1.5;
        max-width: min(var(--lp-prose), 100%);
      }

      .navi-lp-band--gallery {
        position: relative;
        overflow: hidden;
        background: linear-gradient(180deg, #fffefb 0%, var(--lp-cream) 100%);
      }
      .navi-lp-gallery-mesh {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 0;
        overflow: hidden;
      }
      .navi-lp-band--gallery .navi-lp-inner {
        position: relative;
        z-index: 1;
      }
      .navi-lp-gallery {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
        align-items: stretch;
      }
      .navi-lp-gallery-item {
        margin: 0;
        border-radius: 22px;
        overflow: hidden;
        border: 1px solid #EAE6FF;
        box-shadow: 0 8px 28px rgba(91, 63, 191, 0.08);
      }
      .navi-lp-gallery-item img {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 160px;
        object-fit: cover;
        aspect-ratio: 4 / 3;
      }

      .navi-lp-social-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: clamp(20px, 3vw, 32px);
        align-items: stretch;
      }
      .navi-lp-social-quote {
        margin: 0;
        padding: clamp(28px, 4vw, 40px);
        background: #ffffff;
        border: 1px solid rgba(91, 63, 191, 0.1);
        border-radius: 24px;
        box-shadow: 0 4px 24px rgba(18, 16, 42, 0.06);
        display: flex;
        flex-direction: column;
        justify-content: center;
        min-height: 0;
      }
      .navi-lp-social-photo {
        margin: 0;
        border-radius: 24px;
        overflow: hidden;
        border: 1px solid rgba(91, 63, 191, 0.1);
        box-shadow: 0 4px 24px rgba(18, 16, 42, 0.06);
        display: flex;
        min-height: 260px;
      }
      .navi-lp-social-photo img {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 260px;
        object-fit: cover;
        object-position: center;
      }
      .navi-lp-mid-cta {
        margin-top: 32px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        text-align: center;
      }
      .navi-lp-btn-mid {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        min-height: 52px;
        padding: 14px 28px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 700;
        text-decoration: none;
        color: white;
        background: var(--v500);
        box-shadow: 0 6px 22px rgba(91, 63, 191, 0.28);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-mid:hover {
        background: var(--v700);
        transform: translateY(-2px);
      }
      .navi-lp-mid-cta-hint {
        margin: 0;
        font-family: var(--ff-mono);
        font-size: 10px;
        letter-spacing: 0.05em;
        color: var(--faint);
      }

      .navi-lp-mock-wrap {
        position: relative;
        z-index: 1;
        border-radius: 22px;
        padding: 1px;
        background: linear-gradient(
          135deg,
          rgba(189, 176, 238, 0.9) 0%,
          rgba(91, 63, 191, 0.4) 45%,
          rgba(123, 99, 212, 0.65) 100%
        );
        box-shadow:
          0 22px 60px rgba(46, 34, 114, 0.2),
          0 10px 28px rgba(91, 63, 191, 0.15),
          0 2px 8px rgba(18, 16, 42, 0.06);
      }
      .navi-lp-mock-wrap .navi-lp-mock {
        border: none;
        border-radius: 18px;
        box-shadow: none;
      }
      .navi-lp-mock {
        border: 1.5px solid #E8E4FF;
        border-radius: 18px;
        overflow: hidden;
        background: white;
        box-shadow: 0 16px 48px rgba(91, 63, 191, 0.12), 0 3px 10px rgba(91, 63, 191, 0.06);
      }
      .navi-lp-mock-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        background: var(--v500);
      }
      .navi-lp-mock-top-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .navi-lp-mock-wa-label {
        font-size: 13px;
        font-weight: 700;
        color: white;
        letter-spacing: -0.02em;
      }
      .navi-lp-mock-pills { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
      .navi-lp-mock-pill {
        font-size: 9px;
        font-weight: 600;
        padding: 4px 9px;
        border-radius: 8px;
        color: rgba(255, 255, 255, 0.55);
      }
      .navi-lp-mock-pill--on {
        background: rgba(255, 255, 255, 0.18);
        color: white;
      }
      .navi-lp-mock-stats {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 10px;
        padding: 12px;
        border-bottom: 1px solid #F0EEF8;
      }
      .navi-lp-stat {
        border-radius: 12px;
        padding: 12px 8px;
        text-align: center;
      }
      .navi-lp-stat--vio { background: var(--v50); }
      .navi-lp-stat--cor { background: var(--c50); }
      .navi-lp-stat--ok { background: #E8F5EC; }
      .navi-lp-stat-num {
        display: block;
        font-size: 20px;
        font-weight: 800;
        line-height: 1.1;
        margin-bottom: 4px;
      }
      .navi-lp-stat-num--vio { color: var(--v500); }
      .navi-lp-stat-num--cor { color: var(--c500); }
      .navi-lp-stat-num--ok { color: #276534; }
      .navi-lp-stat-lbl {
        font-size: 9px;
        font-weight: 600;
        color: var(--mid);
      }
      .navi-lp-mock-kanban-scroll {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        background: #FAFAFE;
      }
      .navi-lp-mock-kanban {
        display: grid;
        grid-template-columns: repeat(5, minmax(88px, 1fr));
        gap: 8px;
        padding: 12px;
        min-width: 0;
      }
      .navi-lp-kcol-title {
        font-family: var(--ff-mono);
        font-size: 7px;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--faint);
        margin-bottom: 8px;
        line-height: 1.25;
        min-height: 2.5em;
        display: flex;
        align-items: flex-end;
      }
      .navi-lp-kcard {
        border-radius: 8px;
        padding: 8px 6px;
      }
      .navi-lp-kcard--v { background: var(--v50); }
      .navi-lp-kcard--c { background: var(--c50); }
      .navi-lp-kcard--miss { background: #fff5f5; border: 1px solid rgba(240, 64, 64, 0.15); }
      .navi-lp-kcard--wait { background: var(--warn-bg); border: 1px solid rgba(212, 160, 23, 0.2); }
      .navi-lp-kcard--g { background: var(--success-bg); }
      .navi-lp-kname {
        font-size: 9px;
        font-weight: 700;
        color: var(--ink);
        margin-bottom: 6px;
        line-height: 1.2;
      }
      .navi-lp-kanban-tag {
        font-weight: 600;
        font-size: 7px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 2px 5px;
        border-radius: 4px;
        background: var(--v100);
        color: var(--v700);
      }
      .navi-lp-kcard--c .navi-lp-kanban-tag { background: rgba(240, 64, 64, 0.12); color: var(--c500); }
      .navi-lp-kcard--g .navi-lp-kanban-tag { background: rgba(39, 101, 52, 0.12); color: #276534; }

      .navi-lp-band { padding: clamp(56px, 8vw, 80px) var(--nl-pad); }
      .navi-lp-band--soft {
        background: linear-gradient(180deg, var(--lp-cream-mesh) 0%, rgba(255, 252, 248, 0.92) 100%);
      }

      .navi-lp-quote {
        margin: 0;
        padding: 0;
        border: none;
      }
      .navi-lp-quote p {
        margin: 0;
        font-size: clamp(17px, 2.2vw, 20px);
        font-weight: 500;
        line-height: 1.65;
        color: var(--ink);
        letter-spacing: -0.02em;
      }
      .navi-lp-quote p::before {
        content: "";
        display: block;
        width: 40px;
        height: 3px;
        border-radius: 99px;
        background: linear-gradient(90deg, var(--v500), var(--v200));
        margin-bottom: 20px;
      }
      .navi-lp-quote-by {
        margin: 24px 0 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--v700);
        font-style: normal;
        line-height: 1.45;
      }
      .navi-lp-band--dark {
        background: linear-gradient(168deg, #14122e 0%, var(--v900) 38%, #1f1a48 72%, var(--v700) 100%);
        color: rgba(255, 255, 255, 0.92);
        position: relative;
        overflow: hidden;
      }
      .navi-lp-band--dark::before {
        content: "";
        position: absolute;
        inset: 0;
        background: radial-gradient(ellipse 85% 55% at 85% 15%, rgba(91, 63, 191, 0.24), transparent 58%);
        pointer-events: none;
      }
      .navi-lp-band--dark .navi-lp-inner {
        position: relative;
        z-index: 1;
      }
      .navi-lp-inner {
        max-width: var(--lp-max);
        margin: 0 auto;
      }
      .navi-lp-inner--prose {
        max-width: min(var(--lp-prose), 100%);
        margin-left: auto;
        margin-right: auto;
      }
      .navi-lp-inner--narrow {
        max-width: min(var(--lp-prose), 100%);
        margin-left: auto;
        margin-right: auto;
      }

      .navi-lp-card {
        background: #ffffff;
        border: 1px solid rgba(91, 63, 191, 0.1);
        border-radius: 24px;
        padding: clamp(28px, 4vw, 44px);
        box-shadow: 0 4px 24px rgba(18, 16, 42, 0.05);
      }
      .navi-lp-band--soft .navi-lp-card {
        box-shadow: 0 4px 20px rgba(91, 63, 191, 0.05);
      }
      .navi-lp-card .navi-lp-h2 {
        max-width: min(var(--lp-prose), 100%);
        margin: 0 0 16px;
      }
      .navi-lp-card .navi-lp-p,
      .navi-lp-card .navi-lp-list,
      .navi-lp-card .navi-lp-accent-line {
        max-width: min(var(--lp-prose), 100%);
      }
      .navi-lp-card--split .navi-lp-accent-line--full {
        max-width: none;
      }

      .navi-lp-card--split {
        display: grid;
        gap: 20px 32px;
      }
      @media (min-width: 768px) {
        .navi-lp-card--split {
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
        }
        .navi-lp-card--split .navi-lp-accent-line--full {
          grid-column: 1 / -1;
        }
      }

      .navi-lp-h2 {
        font-family: var(--ff-ui);
        font-weight: 800;
        font-size: clamp(22px, 2.8vw, 30px);
        letter-spacing: -0.025em;
        line-height: 1.2;
        color: var(--ink);
        margin: 0 0 16px;
      }
      .navi-lp-h2--on-dark {
        color: white;
        margin-bottom: 12px;
      }
      .navi-lp-sub-dark {
        font-size: 17px;
        color: rgba(255, 255, 255, 0.72);
        margin: 0 0 24px;
        line-height: 1.5;
      }
      .navi-lp-p {
        font-size: 16px;
        color: var(--mid);
        line-height: 1.65;
        margin: 0 0 16px;
      }
      .navi-lp-list {
        list-style: disc;
        padding-left: 1.25rem;
        margin: 0 0 24px;
        font-size: 16px;
        color: var(--ink2);
        line-height: 1.65;
      }
      .navi-lp-list li { margin-bottom: 8px; }
      .navi-lp-list--tight { margin-bottom: 8px; }
      .navi-lp-list--dark {
        list-style: none;
        padding-left: 0;
        margin: 0;
        font-size: 17px;
        color: rgba(255, 255, 255, 0.88);
      }
      .navi-lp-list--dark li {
        margin-bottom: 14px;
        padding-left: 1.2em;
        position: relative;
      }
      .navi-lp-list--dark li::before {
        content: "—";
        position: absolute;
        left: 0;
        color: var(--v200);
      }
      .navi-lp-accent-line {
        font-size: 16px;
        font-weight: 600;
        color: var(--v700);
        margin: 8px 0 0;
        line-height: 1.5;
      }

      .navi-lp-funnel {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-start;
        gap: 10px 8px;
        margin: 12px 0 24px;
      }
      .navi-lp-funnel-chip {
        display: inline-flex;
        align-items: center;
        padding: 8px 12px;
        border-radius: 10px;
        background: var(--v50);
        border: 1px solid #E8E4FF;
        font-size: 12px;
        font-weight: 700;
        color: var(--v700);
        white-space: nowrap;
      }
      .navi-lp-funnel-arrow {
        color: var(--faint);
        font-size: 14px;
        font-weight: 600;
      }

      .navi-lp-alert {
        margin: 8px 0 20px;
        padding: 16px 18px;
        border-radius: 14px;
        background: var(--c50);
        border: 1px solid rgba(240, 64, 64, 0.2);
      }
      .navi-lp-alert-text {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--ink);
        line-height: 1.5;
      }

      .navi-lp-checklist {
        list-style: none;
        padding: 0;
        margin: 16px 0 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .navi-lp-checklist li {
        font-size: 16px;
        font-weight: 600;
        color: var(--ink);
        line-height: 1.45;
        padding-left: 0;
      }

      .navi-lp-final-cta {
        padding: 0 var(--nl-pad) clamp(56px, 8vw, 80px);
      }
      .navi-lp-final-inner {
        max-width: var(--lp-max);
        margin: 0 auto;
        background: linear-gradient(135deg, var(--v500) 0%, #4a32a8 48%, var(--v700) 100%);
        border-radius: 28px;
        padding: clamp(40px, 6vw, 56px) clamp(24px, 4vw, 48px);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        gap: 18px;
      }
      .navi-lp-btn-final {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        width: 100%;
        max-width: 420px;
        min-height: 56px;
        padding: 16px 32px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 700;
        text-decoration: none;
        color: var(--v500);
        background: white;
        border: none;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.18);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .navi-lp-btn-final:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 32px rgba(0, 0, 0, 0.22);
      }
      .navi-lp-final-hint {
        margin: 0;
        font-family: var(--ff-mono);
        font-size: 11px;
        letter-spacing: 0.04em;
        color: rgba(255, 255, 255, 0.55);
      }

      .navi-lp-footer {
        border-top: 1px solid rgba(91, 63, 191, 0.08);
        padding: 22px var(--nl-pad);
        background: var(--lp-cream);
      }
      .navi-lp-footer-inner {
        max-width: var(--lp-max);
        margin: 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
      }
      .navi-lp-footer-brand { display: flex; align-items: center; gap: 8px; }
      .navi-lp-footer-copy {
        font-family: var(--ff-mono);
        font-size: 10px;
        color: var(--faint);
        margin: 0;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px 8px;
        justify-content: flex-end;
        max-width: 100%;
      }
      .navi-lp-footer-sep {
        color: var(--v100);
        user-select: none;
      }
      .navi-lp-footer-link {
        color: var(--mid);
        text-decoration: none;
        font-weight: 600;
        border-radius: 4px;
        transition: color 0.15s ease;
      }
      .navi-lp-footer-link:hover {
        color: var(--v500);
        text-decoration: underline;
      }

      @media (max-width: 900px) {
        .navi-lp-hero-grid {
          grid-template-columns: 1fr;
        }
        .navi-lp-hero-right {
          order: -1;
          max-width: 420px;
          margin: 0 auto;
          width: 100%;
        }
        .navi-lp-social-grid {
          grid-template-columns: 1fr;
        }
        .navi-lp-social-photo {
          min-height: 220px;
        }
        .navi-lp-social-photo img {
          min-height: 220px;
        }
      }
      @media (max-width: 768px) {
        .navi-lp-footer-copy {
          width: 100%;
          justify-content: flex-start;
        }
        .navi-lp-mock-kanban {
          grid-template-columns: repeat(5, minmax(76px, 1fr));
        }
        .navi-lp-gallery {
          grid-template-columns: 1fr;
        }
        .navi-lp-gallery-item img {
          aspect-ratio: 16 / 10;
          min-height: 200px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .navi-lp-reveal {
          opacity: 1;
          transform: none;
          transition: none;
        }
        .navi-lp-reveal--in {
          opacity: 1;
          transform: none;
        }
      }
    `,
    }}
    />
  </div>
  );
};

export default Welcome;
