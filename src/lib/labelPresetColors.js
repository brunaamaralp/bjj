/**
 * Cores preset de etiquetas: hex persistido na API (labelsHandler exige #RRGGBB)
 * e token CSS do design system para exibição nas bolinhas.
 * Valores alinhados a :root em index.css.
 */
export const LABEL_PRESET_COLORS = [
  { hex: '#5b3fbf', cssVar: '--v500' },
  { hex: '#f04040', cssVar: '--c500' },
  { hex: '#d4a017', cssVar: '--warning' },
  { hex: '#25d366', cssVar: null },
  { hex: '#0088cc', cssVar: null },
  { hex: '#6b6b88', cssVar: '--mid' },
];

/** Cinza legado em etiquetas antigas (não está mais no preset). */
export const LABEL_LEGACY_GRAY_HEX = '#8e8e8e';
