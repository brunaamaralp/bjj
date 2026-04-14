import React from 'react';
import { MessageSquare } from 'lucide-react';

export default function ThreadState({ type, errorText = '', onRetry }) {
  if (type === 'none-selected') {
    return (
      <div
        style={{
          minHeight: '62vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
          <MessageSquare size={44} strokeWidth={1.35} style={{ margin: '0 auto 14px', opacity: 0.55 }} aria-hidden />
          <p style={{ margin: 0, fontSize: '1rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Selecione uma conversa para começar
          </p>
        </div>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: 12, maxWidth: 520, textAlign: 'center' }}>
          <div className="navi-section-heading" style={{ fontSize: '1rem', width: '100%', justifyContent: 'center', marginBottom: 6 }}>Não foi possível carregar a conversa</div>
          <div className="navi-subtitle" style={{ marginBottom: 10, textAlign: 'center' }}>{String(errorText || 'Erro')}</div>
          <button className="btn btn-outline" type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  if (type === 'empty') {
    return (
      <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, maxWidth: 520, textAlign: 'center' }}>
          <div className="navi-section-heading" style={{ fontSize: '1rem', width: '100%', justifyContent: 'center', marginBottom: 6 }}>Sem mensagens nesta conversa</div>
          <div className="navi-subtitle" style={{ margin: 0, textAlign: 'center' }}>Envie a primeira mensagem para iniciar o atendimento.</div>
        </div>
      </div>
    );
  }

  return null;
}
