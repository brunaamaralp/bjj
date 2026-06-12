import React, { useState } from 'react';
import ModalShell from '../shared/ModalShell.jsx';
import {
  FOLLOWUP_OUTCOMES,
  FOLLOWUP_OUTCOME_LABELS,
  FOLLOWUP_OUTCOME_HINTS,
  OBJECTION_TYPES,
  OBJECTION_TYPE_LABELS,
  OUTCOMES_WITH_SNOOZE,
  DEFAULT_SNOOZE_DAYS,
} from '../../lib/followupOutcomes.js';

const OUTCOME_OPTIONS = [
  FOLLOWUP_OUTCOMES.INTERESTED,
  FOLLOWUP_OUTCOMES.THINKING,
  FOLLOWUP_OUTCOMES.OBJECTION,
  FOLLOWUP_OUTCOMES.RESCHEDULE,
  FOLLOWUP_OUTCOMES.ENROLLED,
  FOLLOWUP_OUTCOMES.LOST,
];

function FollowupOutcomeDialogForm({ leadName, onClose, onConfirm, saving }) {
  const [outcome, setOutcome] = useState(FOLLOWUP_OUTCOMES.INTERESTED);
  const [objectionType, setObjectionType] = useState(OBJECTION_TYPES.PRICE);
  const [note, setNote] = useState('');
  const [snooze, setSnooze] = useState(true);

  const showObjection = outcome === FOLLOWUP_OUTCOMES.OBJECTION;
  const showSnooze = OUTCOMES_WITH_SNOOZE.has(outcome);
  const consequenceHint = FOLLOWUP_OUTCOME_HINTS[outcome] || '';

  const handleConfirm = () => {
    onConfirm?.({
      outcome,
      objectionType: showObjection ? objectionType : undefined,
      note: String(note || '').trim(),
      snooze: showSnooze ? snooze : false,
      snoozeDays: DEFAULT_SNOOZE_DAYS,
    });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Concluir retorno"
      footer={
        <>
          <button type="button" className="btn-outline" disabled={saving} onClick={onClose}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" disabled={saving} onClick={handleConfirm}>
            {saving ? 'Salvando…' : 'Confirmar'}
          </button>
        </>
      }
    >
      <div className="followup-outcome-dialog">
        <p className="text-small text-muted followup-outcome-dialog__lead">
          {leadName ? `Como foi o retorno com ${leadName}?` : 'Registre o resultado do retorno.'}
        </p>
        <fieldset className="followup-outcome-dialog__options">
          <legend className="sr-only">Resultado do retorno</legend>
          {OUTCOME_OPTIONS.map((id) => (
            <label key={id} className="followup-outcome-dialog__option">
              <input
                type="radio"
                name="followup-outcome"
                value={id}
                checked={outcome === id}
                onChange={() => setOutcome(id)}
              />
              <span>{FOLLOWUP_OUTCOME_LABELS[id]}</span>
            </label>
          ))}
        </fieldset>

        {consequenceHint ? (
          <p className="followup-outcome-dialog__hint" role="status">
            {consequenceHint}
          </p>
        ) : null}

        {showObjection ? (
          <div className="followup-outcome-dialog__sub form-group">
            <label className="form-label" htmlFor="followup-objection-type">
              Tipo de objeção
            </label>
            <select
              id="followup-objection-type"
              className="form-input"
              value={objectionType}
              onChange={(e) => setObjectionType(e.target.value)}
            >
              {Object.entries(OBJECTION_TYPE_LABELS).map(([val, lbl]) => (
                <option key={val} value={val}>
                  {lbl}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {showSnooze ? (
          <label className="followup-outcome-dialog__snooze text-small">
            <input type="checkbox" checked={snooze} onChange={(e) => setSnooze(e.target.checked)} />
            Lembrar em {DEFAULT_SNOOZE_DAYS} dias (some da lista até lá)
          </label>
        ) : null}

        <div className="followup-outcome-dialog__note form-group">
          <label className="form-label" htmlFor="followup-outcome-note">
            Nota{' '}
            <span className="followup-outcome-dialog__optional">(opcional)</span>
          </label>
          <textarea
            id="followup-outcome-note"
            className="form-input followup-outcome-dialog__textarea"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex.: pediu tabela de valores"
          />
        </div>
      </div>
    </ModalShell>
  );
}

export default function FollowupOutcomeDialog({ open, leadName, onClose, onConfirm, saving = false }) {
  if (!open) return null;
  return (
    <FollowupOutcomeDialogForm
      key={String(leadName || '')}
      leadName={leadName}
      onClose={onClose}
      onConfirm={onConfirm}
      saving={saving}
    />
  );
}
