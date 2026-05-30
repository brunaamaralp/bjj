import React from 'react';

export default function FinanceSettingsStickySave({ visible, saving, onSave, onDiscard }) {
  if (!visible) return null;

  return (
    <div className="finance-settings-sticky-save" role="region" aria-label="Alterações pendentes">
      <div className="finance-settings-sticky-save__inner">
        <span className="finance-settings-sticky-save__label">Alterações não salvas</span>
        <div className="finance-settings-sticky-save__actions">
          <button type="button" className="btn-outline btn-sm" disabled={saving} onClick={onDiscard}>
            Descartar
          </button>
          <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={() => void onSave()}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
