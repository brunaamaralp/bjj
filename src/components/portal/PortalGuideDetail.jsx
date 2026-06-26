import React from 'react';
import { Link } from 'react-router-dom';
import PortalMarkdown from './PortalMarkdown.jsx';

export default function PortalGuideDetail({ guide }) {
  const params = useParams();
  const data = guide || null;

  if (!data) {
    return (
      <div className="portal-card">
        <p className="portal-card__muted">Guia não encontrado.</p>
        <Link to="/portal/orientacoes" className="portal-btn portal-btn--ghost" style={{ marginTop: 12 }}>
          Voltar
        </Link>
      </div>
    );
  }

  return (
    <article>
      <Link to="/portal/orientacoes" className="portal-card__muted" style={{ textDecoration: 'none', fontSize: '0.85rem' }}>
        ← Orientações
      </Link>
      <h1 style={{ margin: '12px 0 8px', fontSize: '1.35rem' }}>{data.title}</h1>
      {data.summary ? <p className="portal-card__muted">{data.summary}</p> : null}
      <div className="portal-card" style={{ marginTop: 16 }}>
        <PortalMarkdown source={data.body_markdown || ''} />
      </div>
    </article>
  );
}