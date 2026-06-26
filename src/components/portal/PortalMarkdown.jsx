import React from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

export default function PortalMarkdown({ source }) {
  const text = String(source || '').trim();
  if (!text) return <p className="portal-card__muted">Sem conteúdo.</p>;

  return (
    <div className="portal-markdown">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
    </div>
  );
}
