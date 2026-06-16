import React from 'react';
import ProfileWhatsAppOfflineEmptyActions from './ProfileWhatsAppOfflineEmptyActions.jsx';

/**
 * Seção Comunicação no perfil — canal integrado na aba Conversa (paridade lead/aluno).
 */
export default function ProfileComunicacaoSection({
  waConnected,
  waStatusChecked,
  phoneDigits,
  onOpenConversation,
}) {
  if (!waStatusChecked) return null;

  return (
    <div className="profile-comunicacao-section">
      <p className="profile-comunicacao-section__heading">Comunicação</p>
      {waConnected ? (
        <>
          <p className="profile-comunicacao-section__hint">
            Mensagens pelo WhatsApp integrado na aba <strong>Conversa</strong>.
          </p>
          {onOpenConversation ? (
            <button type="button" className="btn btn-outline profile-comunicacao-section__cta" onClick={onOpenConversation}>
              Abrir Conversa
            </button>
          ) : null}
        </>
      ) : (
        <ProfileWhatsAppOfflineEmptyActions phoneDigits={phoneDigits} compact />
      )}
    </div>
  );
}
