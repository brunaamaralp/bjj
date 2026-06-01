/**
 * Wordmark nave — marca Nave (Plus Jakarta, lowercase).
 * @param {number} [fontSize=20]
 * @param {'dark' | 'light'} [variant='dark'] — light = texto claro no topbar
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
        letterSpacing: '-0.02em',
        color: light ? 'var(--azul-gelo, #E8EFF6)' : 'var(--cosmos, #000435)',
        textTransform: 'lowercase',
      }}
    >
      nave
    </span>
  );
}
