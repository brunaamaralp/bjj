/**
 * Cores preset de etiquetas: hex persistido na API (labelsHandler exige #RRGGBB)
 * e token CSS do design system para exibição nas bolinhas.
 * Valores alinhados a :root em index.css.
 */
export const LABEL_PRESET_COLORS = [
  { hex: '#004466', cssVar: '--petroleo' },
  { hex: '#f04040', cssVar: '--c500' },
  { hex: '#E4B55D', cssVar: '--dourado' },
  { hex: '#25d366', cssVar: null },
  { hex: '#0088cc', cssVar: null },
  { hex: '#755468', cssVar: '--ameixa' },
];

/** Cinza legado em etiquetas antigas (não está mais no preset). */
export const LABEL_LEGACY_GRAY_HEX = '#8e8e8e';
