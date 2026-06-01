import { NAVI_BRAND_ASSETS } from './brandAssets.js';

/**
 * Lockup completo nave (ícone + wordmark) — PNG com fundo embutido.
 * O container pai deve usar NAVI_BRAND_IMAGE_BG da mesma variante.
 * @param {number} [height=28]
 * @param {'dark' | 'light'} [variant='light']
 * @param {string} [className]
 */
export default function NaviBrandLockup({ height = 28, variant = 'light', className = '' }) {
  const src = variant === 'dark' ? NAVI_BRAND_ASSETS.lockupDark : NAVI_BRAND_ASSETS.lockupLight;

  return (
    <img
      src={src}
      alt="nave"
      className={`navi-brand-lockup navi-brand-lockup--${variant}${className ? ` ${className}` : ''}`}
      height={height}
      style={{ display: 'block', height, width: 'auto', maxWidth: '100%', flexShrink: 0 }}
      decoding="async"
    />
  );
}
