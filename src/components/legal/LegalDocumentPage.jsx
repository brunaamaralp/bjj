import React from 'react';
import '../../styles/legal-pages.css';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import NaviBrandLockup from '../NaviBrandLockup.jsx';
import { LEGAL_ROUTES, LEGAL_COMPANY } from '../../lib/legalConstants.js';
import { getLegalDocumentMeta } from '../../lib/legalContent.js';

function formatVersionDate(isoDate) {
  try {
    const [y, m, d] = String(isoDate).split('-').map(Number);
    if (!y || !m || !d) return isoDate;
    return new Date(y, m - 1, d).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return isoDate;
  }
}

export default function LegalDocumentPage({ kind, sections }) {
  const meta = getLegalDocumentMeta(kind);
  const otherRoute = kind === 'terms' ? LEGAL_ROUTES.privacy : LEGAL_ROUTES.terms;
  const otherLabel = kind === 'terms' ? 'Política de Privacidade' : 'Termos de Uso';

  return (
    <div className="legal-page">
      <div className="legal-page__backdrop" aria-hidden="true">
        <span className="legal-page__blob legal-page__blob--a" />
        <span className="legal-page__blob legal-page__blob--b" />
      </div>

      <header className="legal-page__header">
        <div className="legal-page__header-inner">
          <Link to="/" className="legal-page__brand" aria-label="Voltar ao início">
            <NaviBrandLockup height={40} variant="light" className="navi-brand-lockup--legal" />
          </Link>
          <nav className="legal-page__nav" aria-label="Documentos legais">
            <Link
              to={LEGAL_ROUTES.terms}
              className={kind === 'terms' ? 'legal-page__nav-link is-active' : 'legal-page__nav-link'}
            >
              Termos de Uso
            </Link>
            <Link
              to={LEGAL_ROUTES.privacy}
              className={kind === 'privacy' ? 'legal-page__nav-link is-active' : 'legal-page__nav-link'}
            >
              Privacidade
            </Link>
          </nav>
        </div>
      </header>

      <main className="legal-page__main" id="conteudo-principal">
        <article className="legal-doc">
          <Link to="/" className="legal-doc__back">
            <ArrowLeft size={16} aria-hidden />
            Voltar ao início
          </Link>

          <header className="legal-doc__head">
            <h1 className="legal-doc__title">{meta.title}</h1>
            <p className="legal-doc__meta">
              {meta.updatedLabel}: <time dateTime={meta.version}>{formatVersionDate(meta.version)}</time>
              <span className="legal-doc__meta-sep" aria-hidden>·</span>
              Versão {meta.version}
            </p>
            <p className="legal-doc__intro">
              Documento aplicável ao uso da plataforma {LEGAL_COMPANY.productName}. Em caso de dúvida,
              {' '}
              <a href={`mailto:${LEGAL_COMPANY.privacyEmail}`}>{LEGAL_COMPANY.privacyEmail}</a>.
            </p>
          </header>

          <div className="legal-doc__body">
            {sections.map((section) => (
              <section key={section.id} id={section.id} className="legal-doc__section">
                <h2 className="legal-doc__section-title">{section.title}</h2>
                {section.paragraphs.map((paragraph, index) => (
                  <p key={index} className="legal-doc__paragraph">
                    {paragraph}
                  </p>
                ))}
              </section>
            ))}
          </div>

          <footer className="legal-doc__foot">
            <p>
              Consulte também a{' '}
              <Link to={otherRoute}>{otherLabel}</Link>.
            </p>
            <p className="legal-doc__foot-muted">
              © {new Date().getFullYear()} {LEGAL_COMPANY.legalName}
            </p>
          </footer>
        </article>
      </main>
    </div>
  );
}
