export const ACADEMY_MODE_CRESCIMENTO = 'crescimento';
export const ACADEMY_MODE_CONSOLIDACAO = 'consolidacao';

/**
 * Chip toggle que alterna o modo operacional da página Hoje.
 * @param {{ mode: string, onChange: (mode: string) => void }} props
 */
export default function AcademyModeChip({ mode, onChange }) {
  return (
    <div className="academy-mode-chip" role="group" aria-label="Modo da academia">
      <button
        className={`academy-mode-chip__btn${mode === ACADEMY_MODE_CRESCIMENTO ? ' academy-mode-chip__btn--active' : ''}`}
        onClick={() => onChange(ACADEMY_MODE_CRESCIMENTO)}
        aria-pressed={mode === ACADEMY_MODE_CRESCIMENTO}
        type="button"
      >
        🌱 Crescimento
      </button>
      <button
        className={`academy-mode-chip__btn${mode === ACADEMY_MODE_CONSOLIDACAO ? ' academy-mode-chip__btn--active' : ''}`}
        onClick={() => onChange(ACADEMY_MODE_CONSOLIDACAO)}
        aria-pressed={mode === ACADEMY_MODE_CONSOLIDACAO}
        type="button"
      >
        🏛️ Consolidação
      </button>
    </div>
  );
}
