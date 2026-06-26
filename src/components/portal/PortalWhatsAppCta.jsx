import React from 'react';
import { MessageCircle } from 'lucide-react';

function digitsOnly(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export default function PortalWhatsAppCta({ phone, message = 'Olá! Preciso de ajuda com minha mensalidade.' }) {
  const digits = digitsOnly(phone);
  if (!digits) return null;

  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

  return (
    <div className="portal-whatsapp-cta">
      <a href={url} target="_blank" rel="noopener noreferrer" className="portal-btn portal-btn--primary">
        <MessageCircle size={18} aria-hidden />
        Falar com a academia no WhatsApp
      </a>
    </div>
  );
}
