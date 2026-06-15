export function NlCommandBarTrigger({ onClick }) {
  const label = 'Pergunte ou descreva uma ação…';
  const title =
    'Consultas e comandos: matrículas, mensalidades, funil, caixa ou estoque (⌘K / Ctrl+K)';

  const preloadChunk = () => {
    if (typeof window === 'undefined') return;
    void import('./NlCommandBar.jsx');
  };

  return (
    <button
      type="button"
      className="nl-command-bar-trigger"
      onClick={onClick}
      onMouseEnter={preloadChunk}
      onFocus={preloadChunk}
      title={title}
    >
      <span className="nl-command-bar-trigger__icon" aria-hidden>
        ✦
      </span>
      <span className="nl-command-bar-trigger__label">{label}</span>
      <kbd className="nl-command-bar-trigger__kbd">⌘K</kbd>
    </button>
  );
}
