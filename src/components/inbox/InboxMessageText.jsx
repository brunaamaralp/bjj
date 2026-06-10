import React from 'react';

const URL_SPLIT_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?'")\]}]*)/gi;

/**
 * Texto de mensagem com links em pill (mensagens recebidas do cliente).
 */
export default function InboxMessageText({ content, linkPills = false }) {
  const text = String(content || '');
  if (!text) return null;

  if (!linkPills || !/https?:\/\//i.test(text)) {
    return <div className="inbox-msg-text inbox-msg-text--pre">{text}</div>;
  }

  const parts = text.split(URL_SPLIT_RE);

  return (
    <div className="inbox-msg-text inbox-msg-text--pre">
      {parts.map((part, i) => {
        if (!part) return null;
        const isUrl = /^https?:\/\//i.test(part);
        if (isUrl) {
          return (
            <a
              key={`${i}-${part.slice(0, 24)}`}
              href={part}
              className="inbox-msg-link-pill"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </div>
  );
}
