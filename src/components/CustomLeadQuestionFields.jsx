import React from 'react';
import { normalizeQuestionType } from '../lib/customLeadQuestions.js';

/**
 * Campos de perguntas customizadas (matrícula, lead, etc.).
 */
export default function CustomLeadQuestionFields({ questions, values, onChange, disabled = false }) {
  if (!questions?.length) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {questions.map((q) => {
        const qid = String(q?.id || '').trim();
        if (!qid) return null;
        const type = normalizeQuestionType(q.type);
        const label = String(q?.label || '').trim();

        if (type === 'boolean') {
          const checked = values[qid] === true || values[qid] === 'true';
          return (
            <label
              key={qid}
              className="flex items-center gap-2"
              style={{ fontSize: 14, cursor: disabled ? 'default' : 'pointer' }}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={(e) => onChange(qid, e.target.checked)}
              />
              <span>{label}</span>
            </label>
          );
        }

        if (type === 'select') {
          const options = Array.isArray(q.options) ? q.options : [];
          return (
            <div key={qid} className="form-group" style={{ margin: 0 }}>
              <label className="info-mini-label" style={{ display: 'block', marginBottom: 4 }}>
                {label}
              </label>
              <select
                className="form-input"
                value={String(values[qid] ?? '')}
                disabled={disabled}
                onChange={(e) => onChange(qid, e.target.value)}
              >
                <option value="">Selecione…</option>
                {options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          );
        }

        if (type === 'number') {
          return (
            <div key={qid} className="form-group" style={{ margin: 0 }}>
              <label className="info-mini-label" style={{ display: 'block', marginBottom: 4 }}>
                {label}
              </label>
              <input
                type="number"
                className="form-input"
                value={values[qid] ?? ''}
                disabled={disabled}
                onChange={(e) => onChange(qid, e.target.value)}
              />
            </div>
          );
        }

        return (
          <div key={qid} className="form-group" style={{ margin: 0 }}>
            <label className="info-mini-label" style={{ display: 'block', marginBottom: 4 }}>
              {label}
            </label>
            <input
              type="text"
              className="form-input"
              value={String(values[qid] ?? '')}
              disabled={disabled}
              onChange={(e) => onChange(qid, e.target.value)}
            />
          </div>
        );
      })}
    </div>
  );
}
