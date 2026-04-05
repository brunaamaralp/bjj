/**
 * Marca Navi — ícone raster (planeta / órbita / lua) em /public/navi-icon.png
 * @param {number} [size=26]
 * @param {'default' | 'white'} [variant='default'] — no escuro: mosaico claro para o PNG com fundo branco
 */
export default function NaviLogo({ size = 26, variant = 'default' }) {
  const onDark = variant === 'white';

  return (
    <span
      className="navi-logo-wrap"
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        borderRadius: onDark ? 9 : 8,
        overflow: 'hidden',
        background: onDark ? 'rgba(255,255,255,0.96)' : 'transparent',
        boxShadow: onDark ? '0 1px 3px rgba(0,0,0,0.2)' : undefined,
      }}
      aria-hidden
    >
      <img
        src="/navi-icon.png?v=1"
        alt=""
        width={onDark ? Math.round(size - 4) : size}
        height={onDark ? Math.round(size - 4) : size}
        className="navi-logo-img"
        style={{
          display: 'block',
          objectFit: 'contain',
          width: onDark ? Math.round(size - 4) : size,
          height: onDark ? Math.round(size - 4) : size,
        }}
        decoding="async"
      />
    </span>
  );
}
