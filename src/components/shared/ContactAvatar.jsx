import React, { useState } from 'react';
import { contactInitials } from '../../lib/contactInitials.js';
import './contact-avatar.css';

/**
 * Avatar de contato com fallback de iniciais.
 * Não busca foto de perfil do WhatsApp — passe `avatar_url` só se já existir de fonte confiável.
 *
 * @param {{ name?: string, avatar_url?: string }} contact
 * @param {number} [size=34]
 * @param {boolean} [fill=false] — preenche o container pai (lista Inbox)
 * @param {boolean} [priority=false] — eager + fetchpriority high (item visível/selecionado)
 * @param {string} [className]
 */
export default function ContactAvatar({ contact, size = 34, fill = false, priority = false, className = '' }) {
  const [imgError, setImgError] = useState(false);
  const name = String(contact?.name || '').trim();
  const avatarUrl = String(contact?.avatar_url || '').trim();
  const initials = contactInitials(name);
  const rootClass = ['contact-avatar', fill ? 'contact-avatar--fill' : '', className].filter(Boolean).join(' ');
  const boxStyle = fill ? undefined : { width: size, height: size };
  const initialsStyle = { ...boxStyle, fontSize: size * 0.35 };

  if (avatarUrl && !imgError) {
    return (
      <span className={rootClass} style={boxStyle} aria-hidden>
        <img
          src={avatarUrl}
          alt={name || 'Contato'}
          className="contact-avatar__img"
          style={{ width: '100%', height: '100%' }}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'auto'}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      </span>
    );
  }

  return (
    <span className={`${rootClass} contact-avatar__initials`} style={initialsStyle} aria-hidden={!name}>
      {initials}
    </span>
  );
}
