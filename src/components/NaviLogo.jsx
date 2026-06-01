import { NAVI_BRAND_ASSETS } from './brandAssets.js';

/**
 * Ícone Nave (símbolo n + estrela) — PNG quadrado com fundo embutido.
 * O container pai deve usar NAVI_BRAND_IMAGE_BG da mesma variante.
 * @param {number} [size=26]
 * @param {'default' | 'on-dark' | 'on-light' | 'white'} [variant='default']
 * @param {string} [className]
 */
export default function NaviLogo({ size = 26, variant = 'default', className = '' }) {
  const onDark = variant === 'on-dark' || variant === 'white';
  const src = onDark ? NAVI_BRAND_ASSETS.iconDark : NAVI_BRAND_ASSETS.iconLight;

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      className={`navi-logo${onDark ? ' navi-logo--on-dark' : ' navi-logo--on-light'}${className ? ` ${className}` : ''}`}
      style={{ display: 'block', width: size, height: size, flexShrink: 0, objectFit: 'contain' }}
      decoding="async"
      aria-hidden
    />
  );
}
