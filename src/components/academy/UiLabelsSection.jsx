import React, { useMemo, useState } from 'react';
import { useUiStore } from '../../store/useUiStore';
import { useTerms } from '../../lib/terminology.js';
import FieldError from '../shared/FieldError.jsx';

const LABEL_KEYS = [
  { key: 'leads', label: 'Leads / interessados', placeholder: 'Leads' },
  { key: 'students', label: 'Alunos', placeholder: 'Alunos' },
  { key: 'classes', label: 'Aulas / atendimentos', placeholder: 'Aulas' },
  { key: 'pipeline', label: 'Funil (menu)', placeholder: 'Funil' },
];

export default function UiLabelsSection({ academy, setAcademy, onSave, canEdit }) {
  const terms = useTerms();
  const addToast = useUiStore((s) => s.addToast);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const labels = useMemo(
    () => ({
      leads: academy?.uiLabels?.leads || 'Leads',
      students: academy?.uiLabels?.students || 'Alunos',
      classes: academy?.uiLabels?.classes || 'Aulas',
      pipeline: academy?.uiLabels?.pipeline || 'Funil',
    }),
    [academy?.uiLabels]
  );

  const validate = () => {
    const next = {};
    for (const { key } of LABEL_KEYS) {
      if (!String(labels[key] || '').trim()) {
        next[key] = 'Informe um rótulo.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      addToast({ type: 'error', message: 'Preencha todos os rótulos.' });
      return;
    }
    setSaving(true);
    try {
      await onSave({
        successMessage: 'Etiquetas do sistema salvas.',
      });
    } catch {
      void 0;
    } finally {
      setSaving(false);
    }
  };

  const updateLabel = (key, value) => {
    setAcademy((a) => ({
      ...a,
      uiLabels: { ...(a.uiLabels || {}), [key]: value },
    }));
  };

  return (
    <div className="finance-settings-section-body">
      <p className="text-small text-muted" style={{ margin: '0 0 16px', lineHeight: 1.45 }}>
        Personalize os nomes exibidos no menu e nas telas da {terms.workspaceNoun}. A terminologia da
        vertical ({academy.vertical === 'physio' ? 'Fisioterapia' : 'Academia'}) continua aplicada onde
        fizer sentido.
      </p>
      <div className="card" style={{ padding: canEdit ? 16 : 0 }}>
        {canEdit ? (
          <div className="settings-form">
            {LABEL_KEYS.map(({ key, label, placeholder }) => (
              <div className="form-group" key={key}>
                <label>{label}</label>
                <input
                  className="form-input"
                  value={labels[key]}
                  onChange={(e) => updateLabel(key, e.target.value)}
                  placeholder={placeholder}
                  maxLength={32}
                />
                {errors[key] ? <FieldError>{errors[key]}</FieldError> : null}
              </div>
            ))}
            <button type="button" className="btn-primary" disabled={saving} onClick={() => void handleSave()}>
              {saving ? 'Salvando…' : 'Salvar etiquetas'}
            </button>
          </div>
        ) : (
          <ul className="flex-col gap-2" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {LABEL_KEYS.map(({ key, label }) => (
              <li key={key} className="info-row">
                <span className="info-row-label">{label}</span>
                <span className="info-row-value">{labels[key]}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
