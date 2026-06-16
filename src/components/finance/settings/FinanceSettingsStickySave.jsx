import React from 'react';

export default function FinanceSettingsStickySave({
  visible,
  saving,
  onSave,
  onDiscard,
  saveHint = '',
  saveIssueSectionId = null,
  saveIssueSectionLabel = '',
  onGoToIssueSection,
}) {
  if (!visible) return null;

  const showSectionLink =
    saveHint &&
    saveIssueSectionId &&
    typeof onGoToIssueSection === 'function';

  return (
    <div className="finance-settings-sticky-save" role="region" aria-label="Alterações pendentes">
      <div className="finance-settings-sticky-save__inner">
        <div className="finance-settings-sticky-save__copy">
          <span className="finance-settings-sticky-save__label">Alterações não salvas</span>
          {saveHint ? (
            <div className="finance-settings-sticky-save__hint-wrap">
              <p className="finance-settings-sticky-save__hint" role="alert">
                {saveHint}
              </p>
              {showSectionLink ? (
                <button
                  type="button"
                  className="finance-settings-sticky-save__section-link"
                  onClick={() => onGoToIssueSection(saveIssueSectionId)}
                >
                  Ir para {saveIssueSectionLabel || 'seção com erro'}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
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
