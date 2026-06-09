import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  MessageCircle,
  Coins,
  FileText,
  Store,
  ChevronDown,
} from 'lucide-react';
import NaviBrandLockup from '../components/NaviBrandLockup.jsx';
import NaviLogo from '../components/NaviLogo.jsx';

/* ── WhatsApp Mockup ──────────────────────────────────────────────── */

const MESSAGES = [
  { role: 'user', text: 'Tenho interesse em começar, mas nunca fiz luta nenhuma', delay: 300 },
  { role: 'bot', text: 'Sem problema, nossa turma iniciante é feita pra isso! Você prefere treinar de manhã ou à noite?', delay: 1600 },
  { role: 'user', text: 'De manhã', delay: 3000 },
  { role: 'bot', text: 'Temos turma às 8h. Quer vir experimentar uma aula gratuita?', delay: 4200 },
  { role: 'user', text: 'Quero sim!', delay: 5600 },
  { role: 'bot', text: 'Confirmo sua vaga pra segunda às 8h? 🥋', delay: 6800 },
  { role: 'user', text: 'Pode confirmar!', delay: 8200 },
  { role: 'bot', text: 'Ótimo! Te esperamos na segunda 💪', delay: 9400 },
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
            setVisibleMessages((prev) => [...prev, { ...msg, idx: i }]);
          }, msg.delay));
        } else {
          timers.push(setTimeout(() => {
            setVisibleMessages((prev) => [...prev, { ...msg, idx: i }]);
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
      <div className="wapp-header">
        <NaviLogo size={34} variant="white" className="wapp-avatar" />
        <div className="wapp-header-info">
          <div className="wapp-name">Nave — Academia</div>
          <div className="wapp-status">
            <span className="wapp-online-dot" />
            <span className="wapp-online-text">online agora</span>
          </div>
        </div>
        <div className="wapp-ai-badge">IA</div>
      </div>

      <div className="wapp-body">
        {visibleMessages.map((msg, i) => (
          <div key={`${msg.idx}-${i}`} className={`wapp-msg ${msg.role}`}>
            <div className="wapp-bubble" data-time={getTime(MESSAGES.length - msg.idx)}>
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
          <div className="wapp-result-badge">Experimental agendada</div>
        )}
      </div>

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

const FUNIL_STEPS = [
  'Novo',
  'Aula experimental',
  'Não compareceu',
  'Aguardando decisão',
  'Matriculado',
];

const POSICIONAMENTO_ITENS = [
  'Todo lead recebe resposta em segundos — mesmo de madrugada',
  'Toda conversa fica registrada na inbox e no perfil do lead',
  'Todo interessado aparece no funil com próximo passo claro',
  'Toda oportunidade gera tarefa ou alerta quando esfria',
];

const MODULE_CARDS = [
  {
    id: 'whatsapp',
    icon: MessageCircle,
    title: 'WhatsApp integrado',
    text: 'Conecte o WhatsApp da academia em poucos minutos. Conversas na inbox — a IA responde, equipe assume quando precisar.',
  },
  {
    id: 'financeiro',
    icon: Coins,
    title: 'Financeiro',
    text: 'Mensalidades, inadimplência e lançamentos sem planilha. Veja quem está em dia e como está o caixa.',
  },
  {
    id: 'contratos',
    icon: FileText,
    title: 'Contratos',
    text: 'Contratos digitais com assinatura (Autentique) direto do perfil do aluno.',
  },
  {
    id: 'loja',
    icon: Store,
    title: 'Vendas e loja',
    text: 'Venda de kimono, rashguard e produtos — com estoque quando o módulo estiver ativo.',
    footnote: true,
  },
];

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Conecte seu WhatsApp',
    text: 'Escaneie o QR Code e suas conversas passam a chegar na inbox. O agente assume o atendimento inicial.',
  },
  {
    title: 'Configure planos e agente',
    text: 'Informe horários, valores e tom de voz. Em cerca de 10 minutos o agente está pronto.',
  },
  {
    title: 'Ative as automações',
    text: 'Follow-up de experimental, lembretes e tarefas para a equipe. Você liga os gatilhos quando quiser.',
  },
];

const RETENTION_ITEMS = [
  { tag: 'HOJE', tone: 'green', name: 'Marcos Rocha', detail: 'Aniversário' },
  { tag: '14 DIAS', tone: 'gold', name: 'Camila Lima', detail: 'Sem check-in' },
  { tag: 'URGENTE', tone: 'red', name: 'Rafael Dias', detail: 'Mensalidade em atraso' },
];

const FAQ_ITEMS = [
  {
    q: 'A IA vai responder parecendo robô?',
    a: 'Você define tom, planos e horários no assistente. O agente responde de forma objetiva no WhatsApp e transfere para humano quando a dúvida foge do escopo ou precisa de decisão sua.',
  },
  {
    q: 'Preciso de outro sistema para mensalidades?',
    a: 'Não. O Nave controla mensalidades, lançamentos e inadimplência no módulo financeiro — no mesmo lugar do funil e das conversas.',
  },
  {
    q: 'Funciona para estúdios que não são academia de luta?',
    a: 'Sim. Pilates, dança, musculação, funcional, artes marciais — o agente se configura pelo segmento da sua operação.',
  },
  {
    q: 'E se eu já uso planilha ou outro CRM?',
    a: 'Você pode importar leads por planilha e começar pelo WhatsApp e funil. Migração completa de alunos depende do seu cenário — no teste grátis você valida o fluxo antes de decidir.',
  },
];

function FunnelChips() {
  return (
    <div className="navi-lp-funnel" role="list">
      {FUNIL_STEPS.map((step, i) => (
        <React.Fragment key={step}>
          {i > 0 && <span className="navi-lp-funnel-arrow" aria-hidden>→</span>}
          <span className="navi-lp-funnel-chip" role="listitem">{step}</span>
        </React.Fragment>
      ))}
    </div>
  );
}

function AgentChatPanel() {
  return (
    <div className="navi-lp-feature-panel" aria-hidden="true">
      <div className="navi-lp-panel-bar">
        <span className="navi-lp-panel-dot" />
        <span className="navi-lp-panel-bar-label">Agente IA · Online</span>
        <span className="navi-lp-panel-pill">Humano</span>
      </div>
      <div className="navi-lp-panel-chat">
        <div className="navi-lp-panel-bubble navi-lp-panel-bubble--in">
          Oi! Vi o post no Instagram, queria saber como funcionam os planos?
        </div>
        <div className="navi-lp-panel-bubble navi-lp-panel-bubble--out">
          Olá! Temos planos a partir de valores mensais. Posso te enviar a tabela e agendar uma experimental grátis?
        </div>
      </div>
    </div>
  );
}

function FunnelPanel() {
  return (
    <div className="navi-lp-feature-panel" aria-hidden="true">
      <FunnelChips />
      <div className="navi-lp-alert">
        <p className="navi-lp-alert-text">&quot;3 leads aguardando decisão há mais de 3 dias&quot;</p>
      </div>
    </div>
  );
}

function RetentionPanel() {
  return (
    <div className="navi-lp-feature-panel" aria-hidden="true">
      <ul className="navi-lp-retention-list">
        {RETENTION_ITEMS.map((item) => (
          <li key={item.name} className={`navi-lp-retention-item navi-lp-retention-item--${item.tone}`}>
            <span className="navi-lp-retention-tag">{item.tag}</span>
            <span className="navi-lp-retention-name">
              {item.name}
              <span className="navi-lp-retention-detail"> · {item.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeatureBlock({ id, reverse, title, accent, paragraph, bullets, accentLine, panel, linkHref }) {
  return (
    <section
      id={id}
      className={`navi-lp-band navi-lp-band--feature navi-lp-reveal${reverse ? ' navi-lp-band--soft' : ''}`}
      aria-labelledby={`${id}-title`}
    >
      <div className="navi-lp-inner">
        <div className={`navi-lp-feature-grid${reverse ? ' navi-lp-feature-grid--reverse' : ''}`}>
          <div className="navi-lp-feature-copy">
            <h2 id={`${id}-title`} className="navi-lp-h2">
              {title}
              {accent ? <span className="navi-lp-h2-accent"> {accent}</span> : null}
            </h2>
            <p className="navi-lp-p">{paragraph}</p>
            {bullets?.length ? (
              <ul className="navi-lp-list">
                {bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : null}
            {accentLine ? <p className="navi-lp-accent-line">{accentLine}</p> : null}
            {linkHref ? (
              <a href={linkHref} className="navi-lp-text-link">
                Ver como funciona
                <ArrowRight size={16} strokeWidth={2.4} aria-hidden />
              </a>
            ) : null}
          </div>
          <div className="navi-lp-feature-visual">{panel}</div>
        </div>
      </div>
    </section>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */

const Welcome = () => {
  const [navScrolled, setNavScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setNavScrolled(window.scrollY > 50);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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

      <nav
        className={`navi-lp-nav${navScrolled ? ' navi-lp-nav--scrolled' : ''}`}
        aria-label="Principal"
      >
        <div className="navi-lp-nav-inner">
          <Link to="/" className="navi-lp-nav-brand">
            <NaviBrandLockup height={88} variant="light" className="navi-brand-lockup--lp-nav" />
          </Link>
          <div className="navi-lp-nav-links" aria-label="Seções da página">
            <a href="#recursos" className="navi-lp-nav-link">Recursos</a>
            <a href="#como-funciona" className="navi-lp-nav-link">Como funciona</a>
            <a href="#duvidas" className="navi-lp-nav-link">Dúvidas</a>
          </div>
          <div className="navi-lp-nav-cta">
            <Link to="/login" className="navi-lp-btn-nav-ghost">Entrar</Link>
            <Link to="/cadastro" className="navi-lp-btn-nav-primary">Começar grátis</Link>
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
                CRM completo para academias e estúdios
              </span>
              <h1 id="navi-lp-hero-title" className="navi-lp-hero-h1">
                Pare de perder alunos por causa de atendimento ruim{' '}
                <span className="navi-lp-hero-h1-accent">no WhatsApp</span>
              </h1>
              <p className="navi-lp-hero-sub">
                Do primeiro contato no WhatsApp à mensalidade paga — agente de IA, funil,
                automações, financeiro e contratos num só lugar.
              </p>
              <div className="navi-lp-hero-ctas">
                <Link to="/cadastro" className="navi-lp-btn-hero">
                  Começar teste grátis de 14 dias
                  <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
                </Link>
                <a href="#como-funciona" className="navi-lp-btn-hero-ghost">
                  Ver como funciona
                </a>
              </div>
              <p className="navi-lp-hero-hint">
                Teste grátis por 14 dias · Sem cartão de crédito · Cancele quando quiser
              </p>
            </div>
            <div className="navi-lp-hero-right">
              <span className="navi-lp-mock-blob" aria-hidden="true" />
              <div className="navi-lp-mock-wrap">
                <WhatsAppMockup />
              </div>
              <p className="wapp-caption">Exemplo de atendimento automático no WhatsApp</p>
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

        {/* ── FEATURES ── */}
        <FeatureBlock
          id="feature-agente"
          title="O lead manda mensagem."
          accent="O agente responde."
          paragraph="Configure o agente com o tom, planos e horários da sua academia. Ele qualifica leads, conduz até a experimental e passa para sua equipe quando precisar."
          bullets={[
            'Responde em segundos, 24 horas por dia',
            'Cria o lead e salva tudo na inbox',
            'Agenda experimental ou coleta dados para humano',
            'Não inventa informação — confirma com a equipe',
          ]}
          accentLine="Configure em cerca de 10 minutos"
          panel={<AgentChatPanel />}
          linkHref="#como-funciona"
        />

        <FeatureBlock
          id="feature-funil"
          reverse
          title="Cada lead tem um próximo passo."
          accent="Você sabe qual é."
          paragraph="Funil visual do primeiro contato à matrícula. Alertas quando alguém esfria. Automações após agendar, comparecer ou faltar."
          bullets={[
            'Modelos de mensagem prontos para cada etapa',
            'Tarefas para a equipe quando precisa de humano',
            'Relatórios: novos → agendados → compareceram → matriculados',
          ]}
          accentLine="Sua equipe sabe quem cobrar hoje — sem planilha"
          panel={<FunnelPanel />}
        />

        <FeatureBlock
          id="feature-retencao"
          title="Saiba quem precisa de atenção."
          accent="Antes de perder."
          paragraph="Depois da matrícula, o Nave cruza presença, mensalidades e conversas. Você vê quem sumiu, quem está inadimplente e quem merece um contato hoje."
          accentLine="Inbox, perfil do aluno e histórico — tudo conectado"
          panel={<RetentionPanel />}
        />

        {/* ── MÓDULOS ── */}
        <section
          id="recursos"
          className="navi-lp-band navi-lp-band--soft navi-lp-reveal"
          aria-labelledby="navi-lp-modulos-title"
        >
          <div className="navi-lp-inner">
            <div className="navi-lp-section-head">
              <h2 id="navi-lp-modulos-title" className="navi-lp-h2 navi-lp-h2--center">
                Da primeira mensagem ao caixa da academia
              </h2>
              <p className="navi-lp-p navi-lp-p--center">
                Tudo que sua equipe usa depois do &quot;oi&quot;.
              </p>
            </div>
            <div className="navi-lp-modules-grid">
              {MODULE_CARDS.map(({ id, icon: Icon, title, text, footnote }) => (
                <article key={id} className="navi-lp-module-card">
                  <div className="navi-lp-module-icon" aria-hidden="true">
                    <Icon size={22} strokeWidth={2} />
                  </div>
                  <h3 className="navi-lp-module-title">{title}</h3>
                  <p className="navi-lp-module-text">{text}</p>
                  {footnote ? (
                    <p className="navi-lp-module-footnote">* Módulo de loja disponível conforme o plano da academia.</p>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── COMO FUNCIONA ── */}
        <section
          id="como-funciona"
          className="navi-lp-band navi-lp-reveal"
          aria-labelledby="navi-lp-steps-title"
        >
          <div className="navi-lp-inner navi-lp-inner--narrow">
            <div className="navi-lp-section-head">
              <h2 id="navi-lp-steps-title" className="navi-lp-h2 navi-lp-h2--center">
                Pronto em 3 passos.
                <span className="navi-lp-h2-accent"> Sem consultoria.</span>
              </h2>
            </div>
            <ol className="navi-lp-steps">
              {HOW_IT_WORKS_STEPS.map((step, i) => (
                <li key={step.title} className="navi-lp-step">
                  <span className="navi-lp-step-num" aria-hidden="true">{i + 1}</span>
                  <div>
                    <h3 className="navi-lp-step-title">{step.title}</h3>
                    <p className="navi-lp-p">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── PROBLEMA + CHECKLIST ── */}
        <section className="navi-lp-band navi-lp-band--dark navi-lp-reveal" aria-labelledby="navi-lp-problema">
          <div className="navi-lp-inner navi-lp-inner--narrow">
            <h2 id="navi-lp-problema" className="navi-lp-h2 navi-lp-h2--on-dark">
              O problema não é só atendimento.
            </h2>
            <p className="navi-lp-sub-dark">
              É o que acontece depois do &quot;oi&quot; — e ninguém da equipe vê.
            </p>
            <ul className="navi-lp-list navi-lp-list--dark">
              <li>O lead pergunta… e some</li>
              <li>Faz aula… e ninguém chama</li>
              <li>Demonstra interesse… e esfria</li>
              <li>Faz matrícula… e some no controle de mensalidades</li>
            </ul>
            <ul className="navi-lp-checklist navi-lp-checklist--dark">
              {POSICIONAMENTO_ITENS.map((text) => (
                <li key={text}>
                  <Check size={16} strokeWidth={2.5} color="var(--v200)" aria-hidden="true" />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── DEPOIMENTO ── */}
        <section className="navi-lp-band navi-lp-band--soft navi-lp-reveal" aria-label="Depoimento de academia parceira">
          <div className="navi-lp-inner">
            <div className="navi-lp-social-grid">
              <div className="navi-lp-social-quote">
                <blockquote className="navi-lp-quote">
                  <p>
                    &quot;O Nave elevou completamente o nível do nosso atendimento. Hoje a gente converte mais,
                    acompanha melhor e não perde mais contato por falta de resposta.&quot;
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
                Começar teste grátis de 14 dias
                <ArrowRight size={18} strokeWidth={2.4} aria-hidden />
              </Link>
              <p className="navi-lp-mid-cta-hint">14 dias grátis · Sem cartão · Cancele quando quiser</p>
            </div>
          </div>
        </section>

        {/* ── FAQ ── */}
        <section
          id="duvidas"
          className="navi-lp-band navi-lp-reveal"
          aria-labelledby="navi-lp-faq-title"
        >
          <div className="navi-lp-inner navi-lp-inner--narrow">
            <h2 id="navi-lp-faq-title" className="navi-lp-h2 navi-lp-h2--center">
              Dúvidas frequentes
            </h2>
            <div className="navi-lp-faq">
              {FAQ_ITEMS.map((item) => (
                <details key={item.q} className="navi-lp-faq-item">
                  <summary className="navi-lp-faq-q">
                    {item.q}
                    <ChevronDown size={18} className="navi-lp-faq-chevron" aria-hidden />
                  </summary>
                  <p className="navi-lp-faq-a">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA FINAL ── */}
        <section className="navi-lp-final-cta navi-lp-reveal" aria-labelledby="navi-lp-cta-final-title">
          <span className="navi-lp-final-circle navi-lp-final-circle--a" aria-hidden="true" />
          <span className="navi-lp-final-circle navi-lp-final-circle--b" aria-hidden="true" />
          <div className="navi-lp-final-inner">
            <h2 id="navi-lp-cta-final-title" className="navi-lp-h2 navi-lp-h2--on-dark navi-lp-h2--center">
              Chega de lead perdido no WhatsApp.
            </h2>
            <p className="navi-lp-final-sub">
              Teste 14 dias grátis e veja funil, automações e financeiro no mesmo lugar.
            </p>
            <Link to="/cadastro" className="navi-lp-btn-final">
              Ativar meu teste grátis de 14 dias
              <ArrowRight size={20} strokeWidth={2.4} aria-hidden />
            </Link>
            <p className="navi-lp-final-hint">Sem compromisso · Cancelamento a qualquer momento</p>
          </div>
        </section>
      </main>

      <footer className="navi-lp-footer">
        <div className="navi-lp-footer-inner">
          <div className="navi-lp-footer-brand">
            <NaviBrandLockup height={22} variant="dark" />
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
        __html: LP_STYLES,
      }}
      />
    </div>
  );
};

const LP_STYLES = `
      @keyframes navi-lp-fade-up {
        from { opacity: 0; transform: translateY(16px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      .navi-lp {
        --nl-pad: clamp(20px, 4vw, 48px);
        --lp-max: 1100px;
        --lp-prose: 42rem;
        --lp-dark: var(--navi-brand-img-bg-dark);
        --lp-light: var(--azul-gelo);
        --lp-violet: var(--petroleo);
        --lp-pill-bg: color-mix(in srgb, var(--petroleo) 8%, var(--azul-gelo));
        --lp-neon: #25D366;
        min-height: 100vh;
        background: var(--azul-gelo);
        color: var(--ink);
        font-family: var(--ff-ui);
        overflow-x: clip;
      }
      #recursos,
      #como-funciona,
      #duvidas,
      #feature-agente,
      #feature-funil,
      #feature-retencao {
        scroll-margin-top: clamp(84px, 14vw, 112px);
      }

      .navi-lp-skip {
        position: absolute; left: -9999px; top: auto;
        width: 1px; height: 1px; overflow: hidden;
      }
      .navi-lp-skip:focus {
        position: fixed; left: 12px; top: 12px; z-index: 200;
        width: auto; height: auto; padding: 10px 16px;
        background: var(--color-accent); color: #fff;
        font-weight: 700; font-size: 14px;
        border-radius: 8px; text-decoration: none;
      }

      .navi-lp a:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--color-accent);
      }
      .navi-lp-nav-brand:focus-visible { border-radius: 12px; }
      .navi-lp-btn-nav-primary:focus-visible,
      .navi-lp-btn-hero:focus-visible,
      .navi-lp-btn-hero-ghost:focus-visible,
      .navi-lp-btn-mid:focus-visible,
      .navi-lp-btn-final:focus-visible {
        border-radius: 100px;
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--color-accent);
      }

      .navi-lp-reveal {
        opacity: 0; transform: translateY(24px);
        transition: opacity 0.6s ease, transform 0.6s ease;
      }
      .navi-lp-reveal--in { opacity: 1; transform: translateY(0); }

      .navi-lp-nav {
        position: sticky; top: 0; z-index: 100;
        min-height: 112px; display: flex; align-items: center;
        padding: 14px var(--nl-pad);
        background: rgba(255,255,255,0.92);
        backdrop-filter: blur(12px);
        border-bottom: 0.5px solid rgba(0,0,0,0.06);
        transition: background 0.2s ease, box-shadow 0.2s ease;
      }
      .navi-lp-nav--scrolled {
        background: rgba(255,255,255,0.98);
        box-shadow: 0 4px 24px rgba(0,0,0,0.06);
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
      .navi-lp-nav-brand .navi-brand-lockup,
      .navi-lp-nav-brand .navi-brand-lockup--lp-nav {
        display: block;
        height: 88px !important;
        width: auto !important;
        max-width: none !important;
        object-fit: contain;
        object-position: left center;
      }
      .navi-lp-nav-links {
        display: flex; align-items: center; gap: 24px;
        margin-left: auto; margin-right: 16px;
      }
      .navi-lp-nav-link {
        font-size: 14px; font-weight: 500; color: #6b7280;
        text-decoration: none; transition: color 0.15s ease;
      }
      .navi-lp-nav-link:hover { color: var(--ink); }
      .navi-lp-nav-cta { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
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
      .navi-lp-btn-nav-primary:hover { background: #1A1A2E; transform: translateY(-1px); }

      .navi-lp-hero { position: relative; overflow: hidden; background: var(--creme); }
      .navi-lp-hero-mesh { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
      .navi-lp-blob { position: absolute; border-radius: 50%; filter: blur(80px); pointer-events: none; }
      .navi-lp-blob--a {
        width: min(420px,80vw); height: min(420px,80vw);
        background: radial-gradient(circle, rgba(108, 71, 216, 0.22) 0%, rgba(0, 4, 53, 0.08) 55%, transparent 72%);
        top: -15%; right: -8%; opacity: 0.4;
      }
      .navi-lp-blob--b {
        width: min(320px,70vw); height: min(320px,70vw);
        background: radial-gradient(circle, rgba(240,112,112,0.28) 0%, transparent 68%);
        bottom: -5%; left: -12%; opacity: 0.28;
      }
      .navi-lp-blob--c {
        width: min(240px,55vw); height: min(240px,55vw);
        background: radial-gradient(circle, rgba(108, 71, 216,0.3) 0%, transparent 65%);
        top: 40%; right: 24%; opacity: 0.22;
      }
      .navi-lp-blob--g1 {
        width: 70%; height: 140%; left: -20%; top: -35%;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(108, 71, 216, 0.14) 0%, transparent 68%);
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
        display: grid; grid-template-columns: 1fr 1fr;
        align-items: center; gap: clamp(24px,3vw,52px);
      }

      .navi-lp-hero-badge {
        display: inline-flex; align-items: center; gap: 8px;
        padding: 5px 12px; margin-bottom: 20px;
        background: var(--lp-pill-bg); color: var(--lp-violet);
        border-radius: 100px; font-size: 12px; font-weight: 600;
        animation: navi-lp-fade-up 0.4s ease both;
      }
      .navi-lp-badge-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--lp-violet); flex-shrink: 0;
      }
      .navi-lp-hero-h1 {
        font-family: var(--ff-serif); font-weight: 700;
        font-size: clamp(28px,3.5vw,52px);
        letter-spacing: -0.03em; line-height: 1.1;
        color: var(--ink); margin: 0 0 20px;
        animation: navi-lp-fade-up 0.45s 0.05s ease both;
      }
      .navi-lp-hero-h1-accent,
      .navi-lp-h2-accent {
        font-family: var(--ff-serif);
        font-style: italic; font-weight: 700;
        color: var(--lp-violet);
      }
      .navi-lp-hero-sub {
        font-size: clamp(15px,1.8vw,18px); color: #6b7280;
        line-height: 1.65; margin: 0 0 28px; max-width: 34rem;
        animation: navi-lp-fade-up 0.45s 0.08s ease both;
      }
      .navi-lp-hero-ctas {
        display: flex; flex-wrap: wrap; gap: 12px; align-items: center;
        animation: navi-lp-fade-up 0.45s 0.1s ease both;
      }
      .navi-lp-btn-hero {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; min-height: 48px; padding: 12px 24px;
        border-radius: 100px; font-size: 15px; font-weight: 700;
        text-decoration: none; color: #fff; background: var(--color-accent);
        box-shadow: 0 6px 22px rgba(34, 201, 138, 0.35);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-hero:hover {
        background: color-mix(in srgb, var(--color-accent) 90%, var(--color-accent-dark));
        transform: translateY(-2px);
      }
      .navi-lp-btn-hero-ghost {
        display: inline-flex; align-items: center; justify-content: center;
        min-height: 48px; padding: 12px 22px;
        border-radius: 100px; font-size: 15px; font-weight: 600;
        text-decoration: none; color: var(--ink);
        border: 1px solid rgba(0,0,0,0.14);
        background: transparent; transition: border-color 0.15s ease, color 0.15s ease;
      }
      .navi-lp-btn-hero-ghost:hover {
        border-color: var(--color-accent); color: var(--color-accent-dark);
      }
      .navi-lp-hero-hint {
        margin: 14px 0 0; font-size: 11px; letter-spacing: 0.02em;
        color: #9ca3af; line-height: 1.6;
      }
      .navi-lp-hero-right {
        position: relative; z-index: 1;
        display: flex; flex-direction: column; align-items: center;
      }
      .navi-lp-mock-blob {
        position: absolute; width: 88%; height: 78%;
        left: 50%; top: 50%; transform: translate(-50%, -50%);
        border-radius: 45% 55% 48% 52% / 52% 48% 54% 46%;
        background: radial-gradient(ellipse 80% 70% at 35% 30%, rgba(108, 71, 216, 0.18) 0%, rgba(0, 4, 53, 0.08) 70%, transparent 100%);
        filter: blur(36px); z-index: 0; pointer-events: none;
      }
      .navi-lp-mock-wrap {
        position: relative; z-index: 1;
        border-radius: 24px; padding: 1.5px;
        background: linear-gradient(135deg, rgba(108, 71, 216, 0.35) 0%, rgba(19, 17, 31, 0.12) 50%, rgba(31, 170, 94, 0.18) 100%);
        box-shadow: 0 0 0 1px rgba(108, 71, 216, 0.15), 0 20px 56px rgba(0,0,0,0.14);
      }

      .wapp-mockup {
        background: #ECE5DD; border-radius: 22px; overflow: hidden;
        width: 100%; max-width: min(300px, 100%); min-width: 0;
      }
      .wapp-header {
        background: #075E54; padding: 10px 14px;
        display: flex; align-items: center; gap: 10px;
      }
      .wapp-avatar.navi-logo {
        width: 34px; height: 34px; border-radius: 50%;
        overflow: hidden; flex-shrink: 0; object-fit: cover;
        background: var(--navi-brand-img-bg-dark, #13111F);
      }
      .wapp-header-info { flex: 1; min-width: 0; }
      .wapp-name { font-size: 13px; font-weight: 600; color: white; line-height: 1.2; }
      .wapp-status { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
      .wapp-online-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--lp-neon);
        box-shadow: 0 0 6px var(--lp-neon);
      }
      .wapp-online-text { font-size: 10px; color: var(--lp-neon); }
      .wapp-ai-badge {
        background: rgba(37, 211, 102, 0.15); color: var(--lp-neon);
        border: 0.5px solid rgba(37, 211, 102, 0.3);
        border-radius: 4px; font-size: 9px; font-weight: 700;
        padding: 2px 6px;
      }
      .wapp-body {
        padding: 10px; display: flex; flex-direction: column; gap: 5px;
        min-height: 200px; max-height: 280px; overflow-y: auto; background: #ECE5DD;
      }
      .wapp-body::-webkit-scrollbar { display: none; }
      .wapp-msg { display: flex; }
      .wapp-msg.user { justify-content: flex-end; }
      @keyframes msg-in {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
      .wapp-bubble {
        max-width: 82%; padding: 6px 10px; font-size: 11.5px; line-height: 1.5;
        animation: msg-in 0.25s ease forwards;
      }
      .wapp-bubble::after {
        content: attr(data-time); display: block; font-size: 8.5px;
        color: rgba(0,0,0,0.35); text-align: right; margin-top: 2px;
      }
      .wapp-msg.user .wapp-bubble { background: #DCF8C6; border-radius: 10px 2px 10px 10px; }
      .wapp-msg.bot .wapp-bubble { background: white; border-radius: 2px 10px 10px 10px; }
      .wapp-typing {
        display: flex; align-items: center; gap: 4px; padding: 10px 12px;
        background: white; border-radius: 2px 10px 10px 10px;
      }
      .wapp-typing::after { display: none; }
      .typing-dot {
        width: 5px; height: 5px; border-radius: 50%; background: #999;
        animation: typing-bounce 1.2s infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typing-bounce {
        0%, 60%, 100% { transform: scale(0.8); opacity: 0.4; }
        30% { transform: scale(1.1); opacity: 1; }
      }
      .wapp-result-badge {
        display: flex; align-items: center; justify-content: center; gap: 6px;
        background: rgba(37,211,102,0.12); border: 0.5px solid rgba(37,211,102,0.3);
        color: #128c3e; border-radius: 8px; padding: 6px 12px;
        font-size: 11px; font-weight: 600;
      }
      .wapp-result-badge::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: #25D366;
      }
      .wapp-footer {
        background: #f0f0f0; padding: 7px 10px;
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
      }
      .wapp-caption {
        font-size: 11px; color: #9ca3af; margin-top: 12px;
        font-style: italic; text-align: center;
      }

      .navi-lp-band--gallery { position: relative; overflow: hidden; background: var(--lp-light); }
      .navi-lp-gallery-mesh { position: absolute; inset: 0; pointer-events: none; z-index: 0; overflow: hidden; }
      .navi-lp-band--gallery .navi-lp-inner {
        position: relative; z-index: 1;
        max-width: min(1480px, calc(100vw - 2 * var(--nl-pad)));
      }
      .navi-lp-gallery {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
      }
      .navi-lp-gallery-item {
        margin: 0; border-radius: 20px; overflow: hidden;
        border: 0.5px solid rgba(108, 71, 216,0.12);
        box-shadow: 0 6px 32px rgba(108, 71, 216,0.09);
        background: #fff;
      }
      .navi-lp-gallery-item img {
        display: block; width: 100%; height: 100%;
        min-height: 200px; object-fit: cover; aspect-ratio: 16/10;
      }

      .navi-lp-band {
        padding: clamp(56px,8vw,96px) var(--nl-pad); background: #fff;
      }
      .navi-lp-band--soft { background: var(--lp-light); }
      .navi-lp-band--feature { padding: clamp(48px,7vw,80px) var(--nl-pad); }
      .navi-lp-band--dark {
        background: var(--lp-dark); color: rgba(255,255,255,0.92);
        position: relative; overflow: hidden;
      }
      .navi-lp-band--dark::before {
        content: ''; position: absolute; inset: 0;
        background: radial-gradient(ellipse 80% 50% at 90% 10%, rgba(108, 71, 216,0.22), transparent 58%);
        pointer-events: none;
      }
      .navi-lp-band--dark .navi-lp-inner { position: relative; z-index: 1; }

      .navi-lp-inner { max-width: var(--lp-max); margin: 0 auto; }
      .navi-lp-inner--narrow {
        max-width: min(var(--lp-prose),100%);
        margin-left: auto; margin-right: auto;
      }

      .navi-lp-h2 {
        font-family: var(--ff-serif); font-weight: 700;
        font-size: clamp(24px,3.2vw,40px);
        letter-spacing: -0.02em; line-height: 1.12;
        color: var(--ink); margin: 0 0 16px;
      }
      .navi-lp-h2--center { text-align: center; }
      .navi-lp-h2--on-dark { color: #fff; }
      .navi-lp-sub-dark {
        font-size: 17px; color: rgba(255,255,255,0.65);
        margin: 0 0 24px; line-height: 1.55;
      }
      .navi-lp-p {
        font-size: clamp(14px,1.6vw,16px); color: #6b7280;
        line-height: 1.7; margin: 0 0 14px;
      }
      .navi-lp-p--center { text-align: center; max-width: 36rem; margin-left: auto; margin-right: auto; }
      .navi-lp-section-head { margin-bottom: clamp(28px,4vw,40px); }

      .navi-lp-feature-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: clamp(28px,4vw,48px); align-items: center;
      }
      .navi-lp-feature-grid--reverse .navi-lp-feature-copy { order: 2; }
      .navi-lp-feature-grid--reverse .navi-lp-feature-visual { order: 1; }

      .navi-lp-feature-panel {
        background: #fff; border: 0.5px solid rgba(0,0,0,0.08);
        border-radius: 16px; padding: clamp(20px,3vw,28px);
        box-shadow: 0 4px 24px rgba(108, 71, 216,0.06);
        min-height: 220px;
      }
      .navi-lp-panel-bar {
        display: flex; align-items: center; gap: 8px;
        padding-bottom: 14px; margin-bottom: 16px;
        border-bottom: 0.5px solid rgba(0,0,0,0.08);
      }
      .navi-lp-panel-dot {
        width: 8px; height: 8px; border-radius: 50%;
        background: var(--color-accent);
      }
      .navi-lp-panel-bar-label { font-size: 12px; color: #6b7280; font-weight: 500; flex: 1; }
      .navi-lp-panel-pill {
        font-size: 11px; font-weight: 600; color: #6b7280;
        padding: 4px 10px; border-radius: 8px;
        background: var(--lp-light); border: 0.5px solid rgba(0,0,0,0.08);
      }
      .navi-lp-panel-chat { display: flex; flex-direction: column; gap: 10px; }
      .navi-lp-panel-bubble {
        max-width: 90%; padding: 12px 14px; font-size: 13px; line-height: 1.55;
        border-radius: 14px;
      }
      .navi-lp-panel-bubble--in {
        align-self: flex-start; background: var(--lp-light);
        border: 0.5px solid rgba(0,0,0,0.06); border-bottom-left-radius: 4px;
      }
      .navi-lp-panel-bubble--out {
        align-self: flex-end; background: var(--color-accent-surface, #E1F5EE);
        border: 0.5px solid rgba(31, 170, 94, 0.2); border-bottom-right-radius: 4px;
      }

      .navi-lp-list {
        list-style: none; padding: 0; margin: 0 0 20px;
        display: flex; flex-direction: column; gap: 10px;
        font-size: clamp(14px,1.6vw,16px); color: var(--ink2); line-height: 1.6;
      }
      .navi-lp-list li { padding-left: 1.4em; position: relative; }
      .navi-lp-list li::before {
        content: "→"; position: absolute; left: 0;
        color: var(--lp-violet); font-weight: 700;
      }
      .navi-lp-list--dark {
        margin: 0 0 28px; font-size: 17px;
        color: rgba(255,255,255,0.85);
      }
      .navi-lp-list--dark li::before { color: var(--v200); }
      .navi-lp-accent-line {
        font-size: clamp(14px,1.6vw,16px); font-weight: 600;
        color: var(--v700); margin: 8px 0 0; line-height: 1.5;
      }
      .navi-lp-text-link {
        display: inline-flex; align-items: center; gap: 6px;
        margin-top: 12px; font-size: 14px; font-weight: 600;
        color: var(--lp-violet); text-decoration: none;
      }
      .navi-lp-text-link:hover { text-decoration: underline; }

      .navi-lp-funnel {
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 8px 6px; margin: 0 0 16px;
      }
      .navi-lp-funnel-chip {
        display: inline-flex; padding: 7px 12px; border-radius: 100px;
        background: var(--lp-pill-bg); border: 0.5px solid rgba(108, 71, 216,0.15);
        font-size: 12px; font-weight: 600; color: var(--v700);
      }
      .navi-lp-funnel-arrow { color: var(--faint); font-size: 13px; font-weight: 600; }
      .navi-lp-alert {
        padding: 14px 18px; border-radius: 12px; background: var(--c50);
        border: 0.5px solid rgba(240,64,64,0.18);
      }
      .navi-lp-alert-text { margin: 0; font-size: 14px; font-weight: 600; color: var(--ink); }

      .navi-lp-retention-list {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 10px;
      }
      .navi-lp-retention-item {
        display: flex; align-items: center; gap: 12px;
        padding: 12px 14px; border-radius: 12px;
        border: 0.5px solid rgba(0,0,0,0.06); background: var(--lp-light);
      }
      .navi-lp-retention-tag {
        font-family: var(--ff-mono); font-size: 10px; font-weight: 700;
        letter-spacing: 0.04em; padding: 4px 8px; border-radius: 6px; flex-shrink: 0;
      }
      .navi-lp-retention-item--green .navi-lp-retention-tag {
        color: var(--color-accent-dark); background: var(--color-accent-surface, #E1F5EE);
      }
      .navi-lp-retention-item--gold .navi-lp-retention-tag {
        color: #92600a; background: #fef3c7;
      }
      .navi-lp-retention-item--red .navi-lp-retention-tag {
        color: #b91c1c; background: #fee2e2;
      }
      .navi-lp-retention-name { font-size: 14px; font-weight: 600; color: var(--ink); }
      .navi-lp-retention-detail { font-weight: 400; color: #6b7280; }

      .navi-lp-modules-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;
      }
      .navi-lp-module-card {
        background: #fff; border: 0.5px solid rgba(0,0,0,0.08);
        border-radius: 16px; padding: 24px;
        box-shadow: 0 2px 16px rgba(0, 4, 53,0.04);
        display: flex; flex-direction: column; gap: 10px;
        transition: transform 0.2s ease, box-shadow 0.2s ease;
      }
      .navi-lp-module-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 28px rgba(108, 71, 216,0.08);
      }
      .navi-lp-module-icon {
        width: 44px; height: 44px; border-radius: 12px;
        background: var(--lp-pill-bg); color: var(--lp-violet);
        display: flex; align-items: center; justify-content: center;
      }
      .navi-lp-module-title {
        font-family: var(--ff-serif); font-size: 17px; font-weight: 700;
        color: var(--ink); margin: 0;
      }
      .navi-lp-module-text {
        font-size: 14px; color: #6b7280; line-height: 1.6; margin: 0; flex: 1;
      }
      .navi-lp-module-footnote {
        font-size: 11px; color: #9ca3af; margin: 4px 0 0;
      }

      .navi-lp-steps {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 28px;
        border-left: 2px solid rgba(108, 71, 216, 0.2);
        padding-left: 28px;
      }
      .navi-lp-step { position: relative; display: flex; gap: 16px; }
      .navi-lp-step-num {
        position: absolute; left: -41px; top: 2px;
        width: 28px; height: 28px; border-radius: 50%;
        background: #fff; border: 2px solid var(--color-accent);
        color: var(--color-accent-dark); font-size: 12px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        font-family: var(--ff-mono);
      }
      .navi-lp-step-title {
        font-family: var(--ff-serif); font-size: 20px; font-weight: 700;
        color: var(--ink); margin: 0 0 8px;
      }

      .navi-lp-checklist {
        list-style: none; padding: 0; margin: 0;
        display: flex; flex-direction: column; gap: 14px;
      }
      .navi-lp-checklist li {
        display: flex; align-items: flex-start; gap: 10px;
        font-size: clamp(14px,1.6vw,16px); font-weight: 600; line-height: 1.45;
      }
      .navi-lp-checklist--dark li { color: rgba(255,255,255,0.88); }
      .navi-lp-checklist li svg { flex-shrink: 0; margin-top: 2px; }

      .navi-lp-social-grid {
        display: grid; grid-template-columns: 1fr 1fr;
        gap: clamp(20px,3vw,32px); align-items: stretch;
      }
      .navi-lp-social-quote {
        padding: clamp(28px,4vw,44px);
        background: #fff; border: 0.5px solid rgba(0,0,0,0.08);
        border-radius: 16px; box-shadow: 0 2px 16px rgba(0, 4, 53,0.04);
        display: flex; flex-direction: column; justify-content: center;
      }
      .navi-lp-social-photo {
        margin: 0; border-radius: 16px; overflow: hidden;
        border: 0.5px solid rgba(0,0,0,0.08); min-height: 260px;
      }
      .navi-lp-social-photo img {
        display: block; width: 100%; height: 100%;
        min-height: 260px; object-fit: cover;
      }
      .navi-lp-quote { margin: 0; padding: 0; border: none; }
      .navi-lp-quote p {
        margin: 0; font-family: var(--ff-serif); font-style: italic;
        font-size: clamp(17px,2vw,21px); font-weight: 700;
        line-height: 1.55; color: var(--ink);
      }
      .navi-lp-quote p::before {
        content: ""; display: block; width: 36px; height: 3px;
        border-radius: 99px;
        background: linear-gradient(90deg, var(--v500), var(--v200));
        margin-bottom: 20px;
      }
      .navi-lp-quote-by {
        margin: 18px 0 0; font-size: 14px; font-weight: 600;
        color: var(--v700); font-style: normal;
      }
      .navi-lp-mid-cta {
        margin-top: 36px; display: flex; flex-direction: column;
        align-items: center; gap: 10px; text-align: center;
      }
      .navi-lp-btn-mid {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; min-height: 52px; padding: 13px 30px;
        border-radius: 100px; font-size: 15px; font-weight: 700;
        text-decoration: none; color: #fff; background: var(--color-accent);
        box-shadow: 0 6px 22px rgba(34, 201, 138, 0.35);
        transition: background 0.15s ease, transform 0.15s ease;
      }
      .navi-lp-btn-mid:hover { transform: translateY(-2px); }
      .navi-lp-mid-cta-hint { margin: 0; font-size: 12px; color: #9ca3af; }

      .navi-lp-faq { margin-top: 28px; border-top: 0.5px solid rgba(0,0,0,0.08); }
      .navi-lp-faq-item { border-bottom: 0.5px solid rgba(0,0,0,0.08); }
      .navi-lp-faq-q {
        display: flex; align-items: center; justify-content: space-between;
        gap: 16px; padding: 18px 0; font-size: 15px; font-weight: 600;
        color: var(--ink); cursor: pointer; list-style: none;
      }
      .navi-lp-faq-q::-webkit-details-marker { display: none; }
      .navi-lp-faq-chevron {
        flex-shrink: 0; color: #9ca3af;
        transition: transform 0.2s ease;
      }
      .navi-lp-faq-item[open] .navi-lp-faq-chevron { transform: rotate(180deg); }
      .navi-lp-faq-a {
        margin: 0 0 18px; padding-right: 32px;
        font-size: 14px; color: #6b7280; line-height: 1.65;
      }

      .navi-lp-final-cta {
        background: #13111F;
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
        display: flex; flex-direction: column; align-items: center; gap: 16px;
      }
      .navi-lp-final-sub {
        margin: 0 0 8px; font-size: 16px; color: rgba(255,255,255,0.6);
        max-width: 32rem; line-height: 1.55;
      }
      .navi-lp-btn-final {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px; width: 100%; max-width: 420px; min-height: 56px;
        padding: 15px 36px; border-radius: 100px;
        font-size: 16px; font-weight: 700; text-decoration: none;
        color: #fff; background: var(--color-accent);
        box-shadow: 0 8px 28px rgba(34, 201, 138, 0.35);
        transition: transform 0.15s ease;
      }
      .navi-lp-btn-final:hover { transform: translateY(-2px); }
      .navi-lp-final-hint {
        margin: 0; font-size: 12px; color: rgba(255,255,255,0.5);
      }

      .navi-lp-footer { background: var(--lp-dark); padding: 26px var(--nl-pad); }
      .navi-lp-footer-inner {
        max-width: var(--lp-max); margin: 0 auto;
        display: flex; justify-content: space-between;
        align-items: center; flex-wrap: wrap; gap: 14px;
      }
      .navi-lp-footer-copy {
        font-family: var(--ff-mono); font-size: 10px;
        color: rgba(255,255,255,0.35); margin: 0;
        display: flex; flex-wrap: wrap; align-items: center;
        gap: 6px 8px; justify-content: flex-end;
      }
      .navi-lp-footer-sep { color: rgba(255,255,255,0.15); }
      .navi-lp-footer-link {
        color: rgba(255,255,255,0.4); text-decoration: none;
        font-weight: 600; transition: color 0.15s ease;
      }
      .navi-lp-footer-link:hover { color: rgba(255,255,255,0.85); }

      @media (max-width: 900px) {
        .navi-lp-hero-grid { grid-template-columns: 1fr; gap: 28px; }
        .navi-lp-hero-left { max-width: 100%; }
        .navi-lp-hero-right { order: -1; max-width: min(320px, 100%); margin: 0 auto; width: 100%; }
        .navi-lp-feature-grid,
        .navi-lp-feature-grid--reverse {
          grid-template-columns: 1fr;
          gap: 24px;
        }
        .navi-lp-feature-visual { order: -1; }
        .navi-lp-feature-copy { order: 0; }
        .navi-lp-modules-grid { grid-template-columns: 1fr 1fr; }
        .navi-lp-social-grid { grid-template-columns: 1fr; }
        .navi-lp-nav-links { display: none; }
        .navi-lp-nav-inner { gap: 8px; }
      }
      @media (max-width: 768px) {
        .navi-lp { --nl-pad: 18px; }
        .navi-lp-modules-grid { grid-template-columns: 1fr; }
        .navi-lp-gallery { grid-template-columns: 1fr; }
        .navi-lp-btn-nav-ghost { display: none; }
        .navi-lp-nav { min-height: 76px; padding: 10px var(--nl-pad); }
        .navi-lp-nav-brand .navi-brand-lockup,
        .navi-lp-nav-brand .navi-brand-lockup--lp-nav { height: 52px !important; }
        .navi-lp-btn-nav-primary { font-size: 13px; padding: 8px 14px; white-space: nowrap; }
        .navi-lp-hero-grid { padding-top: 20px; padding-bottom: 36px; }
        .navi-lp-hero-badge { font-size: 11px; margin-bottom: 14px; }
        .navi-lp-hero-h1 { margin-bottom: 14px; }
        .navi-lp-hero-sub { margin-bottom: 22px; max-width: none; }
        .navi-lp-hero-ctas { flex-direction: column; align-items: stretch; }
        .navi-lp-btn-hero,
        .navi-lp-btn-hero-ghost,
        .navi-lp-btn-mid,
        .navi-lp-btn-final { width: 100%; max-width: none; }
        .navi-lp-band { padding: 44px var(--nl-pad); }
        .navi-lp-band--feature { padding: 44px var(--nl-pad); }
        .navi-lp-feature-panel { min-height: 0; padding: 18px; }
        .navi-lp-social-quote { padding: 24px 20px; }
        .navi-lp-footer-inner { flex-direction: column; align-items: flex-start; }
        .navi-lp-footer-copy { width: 100%; justify-content: flex-start; }
      }
      @media (max-width: 480px) {
        .navi-lp { --nl-pad: 16px; }
        .navi-lp-nav { min-height: 68px; }
        .navi-lp-nav-brand .navi-brand-lockup,
        .navi-lp-nav-brand .navi-brand-lockup--lp-nav { height: 44px !important; }
        .navi-lp-btn-nav-primary { font-size: 12px; padding: 7px 12px; min-height: 36px; }
        .navi-lp-hero-h1 { font-size: clamp(1.55rem, 7.2vw, 1.85rem); line-height: 1.12; }
        .navi-lp-hero-sub { font-size: 15px; line-height: 1.6; }
        .navi-lp-btn-hero,
        .navi-lp-btn-hero-ghost { font-size: 14px; min-height: 46px; padding: 11px 18px; }
        .navi-lp-h2 { font-size: clamp(1.35rem, 5.8vw, 1.65rem); }
        .navi-lp-h2-accent { display: block; margin-top: 4px; }
        .navi-lp-funnel { gap: 6px; }
        .navi-lp-funnel-arrow { display: none; }
        .navi-lp-funnel-chip { font-size: 11px; padding: 6px 10px; white-space: normal; text-align: center; }
        .navi-lp-retention-item { flex-wrap: wrap; align-items: flex-start; gap: 8px; }
        .navi-lp-retention-name { min-width: 0; flex: 1 1 calc(100% - 72px); font-size: 13px; line-height: 1.45; }
        .navi-lp-steps { padding-left: 22px; margin-left: 6px; gap: 22px; }
        .navi-lp-step-num {
          left: -35px; width: 24px; height: 24px;
          font-size: 11px; top: 0;
        }
        .navi-lp-step-title { font-size: 18px; }
        .navi-lp-list--dark { font-size: 15px; }
        .navi-lp-checklist li { font-size: 14px; }
        .navi-lp-module-card { padding: 18px; }
        .navi-lp-faq-q { font-size: 14px; padding: 14px 0; gap: 12px; align-items: flex-start; }
        .navi-lp-faq-a { padding-right: 0; font-size: 13px; margin-bottom: 14px; }
        .navi-lp-final-cta { padding: 48px var(--nl-pad); }
        .navi-lp-final-sub { font-size: 14px; padding: 0 4px; }
        .navi-lp-btn-final { font-size: 14px; min-height: 50px; padding: 13px 20px; }
        .navi-lp-btn-mid { font-size: 14px; min-height: 48px; padding: 12px 22px; }
        .navi-lp-panel-bubble { font-size: 12px; padding: 10px 12px; max-width: 100%; }
        .navi-lp-alert-text { font-size: 13px; }
        .navi-lp-hero-hint,
        .navi-lp-mid-cta-hint,
        .navi-lp-final-hint { font-size: 10px; line-height: 1.55; }
      }

      @media (prefers-reduced-motion: reduce) {
        .navi-lp-reveal { opacity: 1; transform: none; transition: none; }
        .typing-dot { animation: none; opacity: 0.6; }
        .wapp-bubble { animation: none; }
      }
`;

export default Welcome;
