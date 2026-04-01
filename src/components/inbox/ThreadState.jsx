import React from 'react';

export default function ThreadState({ type, errorText = '', onRetry }) {
  if (type === 'none-selected') {
    return (
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: 'var(--surface)', minHeight: '62vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 420, padding: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Selecione uma conversa para começar</div>
          <div className="text-small">Escolha uma conversa na coluna da esquerda para abrir o histórico e responder.</div>
        </div>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div style={{ padding: 12, display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: 'var(--danger-light)', color: 'var(--danger)', border: '1px solid rgba(220,38,38,0.25)', borderRadius: 10, padding: 12, maxWidth: 520, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Não foi possível carregar a conversa</div>
          <div className="text-small" style={{ marginBottom: 10 }}>{String(errorText || 'Erro')}</div>
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
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Sem mensagens nesta conversa</div>
          <div className="text-small" style={{ color: 'var(--text-secondary)' }}>Envie a primeira mensagem para iniciar o atendimento.</div>
        </div>
      </div>
    );
  }

  return null;
}
