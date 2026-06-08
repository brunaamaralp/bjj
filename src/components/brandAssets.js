/** Versão única dos assets de marca — incrementar ao trocar PNGs em /public */
export const NAVI_BRAND_ASSET_VERSION = '10';

/** Fundo embutido nos PNGs — o container deve usar a mesma cor exata */
export const NAVI_BRAND_IMAGE_BG = {
  dark: '#13111F',
  light: '#FFFFFF',
};

export const NAVI_BRAND_ASSETS = {
  /** Ícone squircle (favicon / sidebar recolhida) */
  appIcon: `/navi-app-icon.png?v=${NAVI_BRAND_ASSET_VERSION}`,
  iconDark: `/navi-icon-on-dark.png?v=${NAVI_BRAND_ASSET_VERSION}`,
  iconLight: `/navi-icon-on-light.png?v=${NAVI_BRAND_ASSET_VERSION}`,
  lockupDark: `/navi-logo-on-dark.png?v=${NAVI_BRAND_ASSET_VERSION}`,
  lockupLight: `/navi-logo-on-light.png?v=${NAVI_BRAND_ASSET_VERSION}`,
};

export function naviBrandSurfaceClass(variant) {
  return variant === 'dark' || variant === 'white' || variant === 'on-dark'
    ? 'navi-brand-surface--dark'
    : 'navi-brand-surface--light';
}
