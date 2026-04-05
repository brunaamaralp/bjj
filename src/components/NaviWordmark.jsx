/**
 * Wordmark Nav + e — marca Nave (Plus Jakarta, “e” em itálico e peso maior).
 * @param {number} [fontSize=20]
 * @param {'dark' | 'light'} [variant='dark'] — light = texto branco no topbar violeta
 */
export default function NaviWordmark({ fontSize = 20, variant = 'dark' }) {
  const light = variant === 'light';
  return (
    <span
      className="navi-wordmark"
      style={{
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        fontWeight: 700,
        fontSize,
        letterSpacing: '-0.01em',
        color: light ? 'white' : 'var(--ink)',
      }}
    >
      Nav
      <em
        style={{
          fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
          fontStyle: 'italic',
          fontWeight: 800,
          color: light ? 'rgba(255,255,255,0.95)' : 'var(--v500)',
          letterSpacing: '-0.02em',
        }}
      >
        e
      </em>
    </span>
  );
}
