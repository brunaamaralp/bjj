import React from 'react';
import { MessageSquare } from 'lucide-react';
import EmptyState from '../shared/EmptyState.jsx';

export default function InboxThreadEmpty() {
  return (
    <div className="inbox-empty-thread-placeholder">
      <EmptyState
        variant="embedded"
        tone="dashed"
        icon={MessageSquare}
        title="Nenhuma conversa selecionada"
        description="Escolha uma conversa à esquerda para ver o histórico e responder o contato."
        role="status"
      />
    </div>
  );
}
