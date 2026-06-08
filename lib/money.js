/**
 * Arredondamento monetário padrão (2 casas decimais).
 */
export function roundMoney(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}
