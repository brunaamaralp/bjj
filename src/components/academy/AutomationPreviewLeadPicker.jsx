import React from 'react';
import { DateInputField } from '../DateInput';
import '../../lib/whatsappTemplates.css';

/**
 * Seletor de lead para pré-visualização de mensagens (Modelos e Configurações).
 */
export default function AutomationPreviewLeadPicker({
  leads = [],
  sampleLeadId,
  onSampleLeadIdChange,
  sampleManual,
  onSampleManualChange,
  className = '',
  scopeHint = false,
}) {
  const showManual = sampleLeadId === '_manual' || leads.length === 0;

  return (
    <div className={`automacoes-preview-lead card ${className}`.trim()}>
      <div className="flex tpl-preview-lead-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <span className="tpl-preview-lead-label">Pré-visualizar com:</span>
        <select
          className="form-input tpl-preview-lead-select"
          value={sampleLeadId}
          onChange={(e) => onSampleLeadIdChange(e.target.value)}
          aria-label="Lead para pré-visualização"
        >
          <option value="">(Primeiro da lista)</option>
          {leads.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
          <option value="_manual">Manual</option>
        </select>
      </div>
      {scopeHint ? (
        <p className="automacoes-preview-lead-hint text-xs text-light" style={{ margin: '8px 0 0' }}>
          Aplica-se a todas as prévias dos gatilhos abaixo.
        </p>
      ) : null}
      {showManual ? (
        <div className="flex gap-2 mt-2" style={{ flexWrap: 'wrap' }}>
          <input
            className="form-input"
            placeholder="Nome"
            value={sampleManual.name}
            onChange={(e) => onSampleManualChange((p) => ({ ...p, name: e.target.value }))}
            style={{ flex: 1, minWidth: 180 }}
          />
          <input
            className="form-input"
            placeholder="Telefone"
            value={sampleManual.phone}
            onChange={(e) => onSampleManualChange((p) => ({ ...p, phone: e.target.value }))}
            style={{ width: 170 }}
          />
          <DateInputField
            className="form-input"
            type="date"
            value={sampleManual.scheduledDate}
            onChange={(e) => onSampleManualChange((p) => ({ ...p, scheduledDate: e.target.value }))}
            style={{ width: 150 }}
          />
          <input
            className="form-input"
            type="time"
            value={sampleManual.scheduledTime}
            onChange={(e) => onSampleManualChange((p) => ({ ...p, scheduledTime: e.target.value }))}
            style={{ width: 120 }}
          />
        </div>
      ) : null}
    </div>
  );
}
