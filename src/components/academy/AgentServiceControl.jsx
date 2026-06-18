import React from 'react';
import {
  getAgentActivateHint,
  isAgentActivateDisabled,
  shouldRenderAgentServiceControl,
} from '../../lib/agentIaServiceControl.js';

export default function AgentServiceControl({
  promptConfigurado,
  canEditPrompt,
  iaAtiva,
  aiModuleEnabled,
  waConnected,
  togglingIa,
  panelOpen,
  onRequestActivate,
  onRequestPause,
}) {
  if (
    !shouldRenderAgentServiceControl({
      promptConfigurado,
      canEditPrompt,
      panelOpen,
    })
  ) {
    return null;
  }

  if (!iaAtiva) {
    const hint = getAgentActivateHint({ aiModuleEnabled, waConnected });
    const disabled = isAgentActivateDisabled({ togglingIa, aiModuleEnabled, waConnected });

    return (
      <div className="agent-ia-activate-cta">
        {hint ? <p className="agent-ia-activate-cta__hint">{hint}</p> : null}
        <button
          type="button"
          className="btn btn-primary"
          onClick={onRequestActivate}
          disabled={disabled}
        >
          {togglingIa ? 'Ativando…' : 'Ativar atendimento automático'}
        </button>
      </div>
    );
  }

  return (
    <div className="agent-ia-activate-cta agent-ia-activate-cta--pause">
      <button
        type="button"
        className="btn btn-outline"
        onClick={onRequestPause}
        disabled={togglingIa}
      >
        {togglingIa ? 'Pausando…' : 'Pausar atendimento automático'}
      </button>
    </div>
  );
}
