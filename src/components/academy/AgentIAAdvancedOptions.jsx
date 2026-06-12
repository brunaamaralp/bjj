import React from 'react';
import { V1_AI_ACTIONS, AI_ACTION_META } from '../../../lib/agentActionConfig.js';

const textareaScrollLockProps = {
  onWheelCapture: (e) => e.stopPropagation(),
  onTouchMoveCapture: (e) => e.stopPropagation(),
};

export default function AgentIAAdvancedOptions({
  canEditPrompt,
  contactLabel,
  loadingPrompt,
  aiActionsEnabled,
  onAiActionsEnabledChange,
  savingAiActions,
  aiActionsSelected,
  onToggleAiAction,
  conversationTimelineEnabled,
  onConversationTimelineChange,
  onSaveAiActions,
  birthdayMessage,
  onBirthdayMessageChange,
  savingBirthdayMessage,
  onSaveBirthdayMessage,
  faqItems,
  onFaqItemsChange,
  savingFaq,
  onSaveFaqData,
  loadingPromptPreview,
  onPreviewFullPrompt,
  savingPrompt,
}) {
  if (!canEditPrompt) return null;

  return (
    <details className="agent-accordion" style={{ marginTop: 20 }}>
      <summary>Personalização e suporte</summary>
      <div className="agent-accordion-content">
        <div className="agent-ia-personalization-card" style={{ marginBottom: 16 }}>
          <p className="agent-ia-personalization-card__title">Ações automáticas no WhatsApp</p>
          <p className="agent-ia-personalization-card__hint">
            A IA pode executar tarefas no sistema após entender a mensagem. A equipe sempre recebe notificação e uma tarefa de
            conferência — mesmo quando a ação é bem-sucedida.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            <span className="text-small" style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>
              {aiActionsEnabled ? 'Execução automática ativa' : 'Execução automática desligada'}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={aiActionsEnabled}
              onClick={() => onAiActionsEnabledChange(!aiActionsEnabled)}
              disabled={loadingPrompt || savingAiActions}
              className={`ai-switch${aiActionsEnabled ? ' ai-switch--on' : ''}${savingAiActions ? ' ai-switch--loading' : ''}`}
              title={aiActionsEnabled ? 'Desligar todas as ações' : 'Permitir ações automáticas'}
            >
              <span className="ai-switch-thumb" />
            </button>
          </div>
          <div className={`agent-ia-action-list${aiActionsEnabled ? '' : ' agent-ia-action-list--disabled'}`}>
            {V1_AI_ACTIONS.map((actionKey) => {
              const meta = AI_ACTION_META[actionKey] || { label: actionKey, description: '' };
              const checked = aiActionsSelected.has(actionKey);
              return (
                <label
                  key={actionKey}
                  className={`agent-ia-action-option${aiActionsEnabled ? '' : ' agent-ia-action-option--disabled'}`}
                >
                  <input
                    type="checkbox"
                    className="agent-ia-action-option__input"
                    checked={checked}
                    disabled={!aiActionsEnabled || loadingPrompt || savingAiActions}
                    onChange={(e) => onToggleAiAction(actionKey, e.target.checked)}
                  />
                  <span>
                    <span className="agent-ia-action-option__title">{meta.label}</span>
                    <span className="agent-ia-action-option__desc">{meta.description}</span>
                  </span>
                </label>
              );
            })}
            <label className={`agent-ia-action-option${aiActionsEnabled ? '' : ' agent-ia-action-option--disabled'}`}>
              <input
                type="checkbox"
                className="agent-ia-action-option__input"
                checked={conversationTimelineEnabled}
                disabled={!aiActionsEnabled || loadingPrompt || savingAiActions}
                onChange={(e) => onConversationTimelineChange(e.target.checked)}
              />
              <span>
                <span className="agent-ia-action-option__title">Registrar momentos importantes no histórico do lead</span>
                <span className="agent-ia-action-option__desc">
                  A IA grava na timeline do contato apenas momentos relevantes da conversa (dados compartilhados, interesse,
                  agendamentos), sem copiar todas as mensagens.
                </span>
              </span>
            </label>
          </div>
          <button
            type="button"
            onClick={() => void onSaveAiActions()}
            className="btn btn-outline agent-ia-action-save"
            disabled={savingAiActions || loadingPrompt}
          >
            {savingAiActions ? 'Salvando…' : 'Salvar ações automáticas'}
          </button>
        </div>

        <div className="agent-ia-personalization-grid">
          <div className="agent-ia-personalization-card">
            <p className="agent-ia-personalization-card__title">Mensagem de aniversário</p>
            <p className="agent-ia-personalization-card__hint">
              Texto de referência e fallback do envio automático (se ativado em Automações → Configurações). Use{' '}
              {'{primeiroNome}'}.
            </p>
            <textarea
              className="agent-prompt-textarea agent-prompt-textarea--sm"
              value={birthdayMessage}
              onChange={(e) => onBirthdayMessageChange(e.target.value)}
              {...textareaScrollLockProps}
              rows={3}
              disabled={loadingPrompt}
              placeholder="Ex: Feliz aniversário, {primeiroNome}!…"
              spellCheck
            />
            <button
              type="button"
              onClick={() => void onSaveBirthdayMessage()}
              className="btn btn-outline"
              style={{ marginTop: 8 }}
              disabled={savingBirthdayMessage || loadingPrompt}
            >
              {savingBirthdayMessage ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
          <div className="agent-ia-personalization-card">
            <p className="agent-ia-personalization-card__title">Perguntas frequentes</p>
            <p className="agent-ia-personalization-card__hint">Pares pergunta/resposta como referência factual do assistente.</p>
            <button
              type="button"
              className="btn btn-outline"
              style={{ marginTop: 0 }}
              onClick={() => onFaqItemsChange((prev) => [...prev, { q: '', a: '' }])}
              disabled={loadingPrompt}
            >
              + Adicionar pergunta
            </button>
          </div>
        </div>

        <details className="agent-accordion agent-accordion-nested" style={{ marginBottom: 16 }}>
          <summary className="text-small" style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Detalhes para suporte
          </summary>
          <p className="text-small agent-field-hint" style={{ marginTop: 8, marginBottom: 0, lineHeight: 1.5 }}>
            {`O assistente também recebe dados técnicos do ${contactLabel.toLowerCase()} junto com o texto. Use `}
            <strong>Ver instruções completas</strong> para inspecionar o conteúdo enviado ao assistente.
          </p>
        </details>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => void onPreviewFullPrompt()}
            className="btn btn-outline"
            disabled={loadingPrompt || savingPrompt || loadingPromptPreview}
            title={`Mostra o texto completo enviado ao assistente, incluindo dados do ${contactLabel.toLowerCase()}`}
          >
            {loadingPromptPreview ? 'Carregando…' : 'Ver instruções completas'}
          </button>
        </div>

        <div className="navi-section-heading" style={{ fontSize: '0.95rem', marginBottom: 8 }}>
          Lista de perguntas
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {faqItems.map((item, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <input
                className="form-input"
                value={item.q}
                onChange={(e) => {
                  const v = e.target.value;
                  onFaqItemsChange((prev) => prev.map((p, i) => (i === idx ? { ...p, q: v } : p)));
                }}
                placeholder="Pergunta"
                disabled={loadingPrompt}
              />
              <textarea
                className="agent-prompt-textarea agent-prompt-textarea--sm"
                value={item.a}
                onChange={(e) => {
                  const v = e.target.value;
                  onFaqItemsChange((prev) => prev.map((p, i) => (i === idx ? { ...p, a: v } : p)));
                }}
                {...textareaScrollLockProps}
                placeholder="Resposta"
                rows={3}
                disabled={loadingPrompt}
              />
              <button
                type="button"
                className="btn btn-outline"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => onFaqItemsChange((prev) => prev.filter((_, i) => i !== idx))}
                disabled={loadingPrompt}
              >
                Remover
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => onFaqItemsChange((prev) => [...prev, { q: '', a: '' }])}
            disabled={loadingPrompt}
          >
            + Adicionar pergunta
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => void onSaveFaqData()}
            disabled={savingFaq || loadingPrompt}
          >
            {savingFaq ? 'Salvando…' : 'Salvar perguntas frequentes'}
          </button>
        </div>
      </div>
    </details>
  );
}
