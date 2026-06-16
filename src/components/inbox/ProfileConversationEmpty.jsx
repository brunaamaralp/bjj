import React from 'react';

/**
 * Empty state compartilhado — perfil (Conversa) e chat widget embutido.
 */
export default function ProfileConversationEmpty({ icon: Icon, title, description, action }) {
  return (
    <div className="profile-conversation-empty">
      {Icon ? <Icon size={40} strokeWidth={1.5} className="profile-conversation-empty__icon" aria-hidden /> : null}
      <div className="profile-conversation-empty__title">{title}</div>
      {description ? <p className="profile-conversation-empty__desc">{description}</p> : null}
      {action || null}
    </div>
  );
}
