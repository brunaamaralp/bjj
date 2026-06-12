import React from 'react';
import { PROMPT_RECOMMENDED_COMBINED_LEN } from '../../../lib/aiPromptLimits.js';
import { formatInstructionsSavedAt } from './agentIaUtils.js';

const textareaScrollLockProps = {
  onWheelCapture: (e) => e.stopPropagation(),
  onTouchMoveCapture: (e) => e.stopPropagation(),
};

export default function AgentIAPromptEditor({
  editIntro,
  onEditIntroChange,
  editBody,
  onEditBodyChange,
  promptSuffix,
  promptIntroBackup,
  promptBodyBackup,
  promptUpdatedAt,
  savingPrompt,
  canEditPrompt,
  onSaveAndTest,
  onCancel,
  onRestore,
  showRestoreModal,
  onCloseRestoreModal,
  onConfirmRestore,
}) {
  const hasBackup = Boolean(
    String(promptIntroBackup || '').trim() ||
      String(promptBodyBackup || '').trim()
  );

  return (
    <div className="agent-prompt-editor animate-in">
      {showRestoreModal ? (
        <div className="agent-restore-modal-backdrop" role="dialog" aria-modal="true">
          <div className="agent-restore-modal">
            <h4 style={{ margin: '0 0 8px' }}>Restaurar versão anterior?</h4>
            <p className="text-small text-light" style={{ margin: 0 }}>
              A versão anterior substituirá as instruções atuais e será salva imediatamente.
            </p>
            <div className="agent-restore-preview">
              <div>
                <strong className="text-small">Atual (Identidade)</strong>
                <pre>{String(editIntro || '').slice(0, 400) || '—'}</pre>
              </div>
              <div>
                <strong className="text-small">Versão anterior (Identidade)</strong>
                <pre>{String(promptIntroBackup || '').slice(0, 400) || '—'}</pre>
              </div>
              <div>
                <strong className="text-small">Atual (Conhecimento)</strong>
                <pre>{String(editBody || '').slice(0, 400) || '—'}</pre>
              </div>
              <div>
                <strong className="text-small">Versão anterior (Conhecimento)</strong>
                <pre>{String(promptBodyBackup || '').slice(0, 400) || '—'}</pre>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary" onClick={onCloseRestoreModal}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" disabled={savingPrompt} onClick={() => void onConfirmRestore()}>
                Restaurar e salvar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <header className="agent-prompt-editor__header">
        <div>
          <h4 className="agent-prompt-editor__title">Revisar & Editar instruções do assistente</h4>
          {promptUpdatedAt ? (
            <p className="text-small" style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>
              Atualizado em {formatInstructionsSavedAt(promptUpdatedAt)}
            </p>
          ) : null}
        </div>
        <button type="button" className="btn btn-outline" style={{ padding: '8px 14px', flexShrink: 0 }} onClick={onCancel}>
          Cancelar
        </button>
      </header>

      <section className="agent-prompt-field" aria-labelledby="agent-prompt-identidade">
        <h5 id="agent-prompt-identidade" className="agent-prompt-field__label">
          Identidade
        </h5>
        <p className="agent-prompt-field__hint">Quem é o assistente, nome e tom de voz</p>
        <textarea
          className="agent-prompt-textarea agent-prompt-textarea--md"
          value={editIntro}
          onChange={(e) => onEditIntroChange(e.target.value)}
          {...textareaScrollLockProps}
          rows={6}
          disabled={savingPrompt}
          placeholder="Ex.: Você é a Ana, atendente do estúdio…"
          spellCheck
        />
        <div className="agent-prompt-meta">
          {String(editIntro || '').length} caracteres · recomendado até {PROMPT_RECOMMENDED_COMBINED_LEN} no total (Identidade + Conhecimento)
        </div>
      </section>

      <section className="agent-prompt-field" aria-labelledby="agent-prompt-conhecimento">
        <h5 id="agent-prompt-conhecimento" className="agent-prompt-field__label">
          Conhecimento
        </h5>
        <p className="agent-prompt-field__hint">Planos, horários, preços, regras e o que o assistente pode informar</p>
        <textarea
          className="agent-prompt-textarea agent-prompt-textarea--lg"
          value={editBody}
          onChange={(e) => onEditBodyChange(e.target.value)}
          {...textareaScrollLockProps}
          rows={12}
          disabled={savingPrompt || !canEditPrompt}
          placeholder="Ex.: Endereço, modalidades, valores, política de experimental…"
          spellCheck
        />
        <div className="agent-prompt-meta">{String(editBody || '').length} caracteres</div>
      </section>

      <section className="agent-prompt-field" aria-labelledby="agent-prompt-sistema">
        <h5 id="agent-prompt-sistema" className="agent-prompt-field__label">
          Regras do sistema{' '}
          <span className="badge badge-info" style={{ marginLeft: 6, verticalAlign: 'middle' }}>
            Não editável
          </span>
        </h5>
        <p className="agent-prompt-field__hint">
          Regras obrigatórias — não editáveis. Inclui respostas em texto de conversa (sem markdown nem listas) no que vai para o
          WhatsApp.
        </p>
        <pre className="agent-prompt-readonly" tabIndex={0}>
          {promptSuffix}
        </pre>
      </section>

      <footer className="agent-prompt-footer">
        <button
          type="button"
          className="btn btn-outline"
          disabled={!hasBackup || savingPrompt || !canEditPrompt}
          onClick={onRestore}
          title={!hasBackup ? 'Nenhuma versão anterior disponível' : 'Restaurar versão anterior'}
        >
          ↩ Restaurar versão anterior
        </button>

        <button type="button" className="btn btn-primary" disabled={savingPrompt} onClick={() => void onSaveAndTest()}>
          {savingPrompt ? 'Salvando…' : 'Salvar e testar'}
        </button>
      </footer>
    </div>
  );
}
