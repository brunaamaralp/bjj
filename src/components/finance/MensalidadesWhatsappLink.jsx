import React from 'react';
import { MessageCircle } from 'lucide-react';
import { buildCollectionWhatsappDraft, buildWaMeUrl } from '../../lib/whatsappLinks.js';

/**
 * Link wa.me para cobrança manual na lista de Mensalidades.
 */
export default function MensalidadesWhatsappLink({
  phone,
  studentName,
  stage = null,
  compact = true,
  className = '',
}) {
  const draft = buildCollectionWhatsappDraft({ stage, studentName });
  const url = buildWaMeUrl(phone, draft);

  if (!url) {
    return (
      <span className="text-small text-muted mensal-whatsapp-link__missing" title="Cadastre telefone no perfil do aluno">
        Sem telefone
      </span>
    );
  }

  const label = compact ? 'WhatsApp' : 'Abrir WhatsApp';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={['mensal-btn-whatsapp', className].filter(Boolean).join(' ')}
      aria-label={`WhatsApp — ${String(studentName || '').trim() || 'aluno'}`}
    >
      <MessageCircle size={14} aria-hidden />
      {label}
    </a>
  );
}
