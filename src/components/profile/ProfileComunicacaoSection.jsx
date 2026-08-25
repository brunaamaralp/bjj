import React from 'react';

/**
 * Seção Comunicação no perfil — canal integrado na aba Conversa (paridade lead/aluno).
 * Aviso de WhatsApp offline fica na aba Conversa, ao tentar enviar mensagem.
 */
export default function ProfileComunicacaoSection({
  waStatusChecked,
  onOpenConversation,
}) {
  if (!waStatusChecked) return null;

  return (
    <div className="profile-comunicacao-section">
      <p className="profile-comunicacao-section__heading">Comunicação</p>
      <p className="profile-comunicacao-section__hint">
        Mensagens pelo WhatsApp integrado na aba <strong>Conversa</strong>.
      </p>
      {onOpenConversation ? (
        <button type="button" className="btn btn-outline profile-comunicacao-section__cta" onClick={onOpenConversation}>
          Abrir Conversa
        </button>
      ) : null}
    </div>
  );
}
