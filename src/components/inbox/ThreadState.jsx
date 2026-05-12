import React from 'react';
import { MessageSquare } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';

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
        <EmptyState
          variant="embedded"
          tone="dashed"
          icon={MessageSquare}
          title="Selecione uma conversa para começar"
          role="status"
        />
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
        <EmptyState
          variant="embedded"
          tone="solid"
          title="Sem mensagens nesta conversa"
          description="Envie a primeira mensagem para iniciar o atendimento."
          role="status"
        />
      </div>
    );
  }

  return null;
}
