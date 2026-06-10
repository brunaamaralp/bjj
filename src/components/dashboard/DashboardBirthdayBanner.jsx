import React, { useState } from 'react';
import { Cake, MessageCircle, Loader2 } from 'lucide-react';
import { sendWhatsappTemplateOutbound } from '../../lib/outboundWhatsappTemplate.js';

/**
 * Destaque de aniversariantes no hero da recepção.
 */
export default function DashboardBirthdayBanner({
  students,
  academyId,
  academyName,
  templatesMap,
  zapsterInstanceId,
  onToast,
  onScrollToSection,
}) {
  const list = students || [];
  const [sendingId, setSendingId] = useState('');

  if (list.length === 0) return null;

  const canSendWa = Boolean(String(zapsterInstanceId || '').trim());

  const handleSend = async (student) => {
    const id = String(student?.id || '').trim();
    if (!id || sendingId) return;
    setSendingId(id);
    try {
      await sendWhatsappTemplateOutbound({
        lead: student,
        academyId,
        academyName,
        templateKey: 'birthday',
        templatesMap,
        zapsterInstanceId,
        onToast,
      });
    } finally {
      setSendingId('');
    }
  };

  const title =
    list.length === 1
      ? `Hoje é aniversário de ${String(list[0].name || 'aluno').trim()}`
      : `${list.length} aniversariantes hoje`;

  return (
    <div className="dashboard-birthday-banner" role="status">
      <div className="dashboard-birthday-banner__main">
        <Cake size={20} strokeWidth={2} className="dashboard-birthday-banner__icon" aria-hidden />
        <div className="dashboard-birthday-banner__text">
          <p className="dashboard-birthday-banner__title">{title}</p>
          {list.length === 1 ? (
            <button
              type="button"
              className="dashboard-birthday-banner__link"
              onClick={onScrollToSection}
            >
              Ver na lista
            </button>
          ) : null}
        </div>
      </div>
      <div className="dashboard-birthday-banner__actions">
        {list.length === 1 ? (
          <button
            type="button"
            className="btn-secondary dashboard-birthday-banner__wa-btn"
            disabled={
              !canSendWa ||
              !String(list[0]?.phone || '').trim() ||
              sendingId === String(list[0]?.id || '')
            }
            title={
              !canSendWa
                ? 'WhatsApp não configurado'
                : !String(list[0]?.phone || '').trim()
                  ? 'Sem telefone cadastrado'
                  : 'Enviar parabéns por WhatsApp'
            }
            onClick={() => void handleSend(list[0])}
          >
            {sendingId === String(list[0]?.id || '') ? (
              <Loader2 size={16} className="spin-refresh" aria-hidden />
            ) : (
              <MessageCircle size={16} aria-hidden />
            )}
            Mandar parabéns
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={onScrollToSection}>
            Ver aniversariantes
          </button>
        )}
      </div>
    </div>
  );
}
