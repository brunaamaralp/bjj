/**
 * Grupos DRE válidos — fonte compartilhada (UI drawer, import server).
 */

export const FINANCE_DRE_GROUP_OPTIONS = [
  'Receita Bruta',
  'Deduções',
  'CMV/CPV',
  'Despesas Operacionais',
  'Depreciação/Amortização',
  'Resultado Financeiro',
  'Imposto s/ Lucro',
];

export const FINANCE_DRE_GROUP_SET = new Set(FINANCE_DRE_GROUP_OPTIONS);

export function sanitizeDreGroup(value) {
  const g = String(value || '').trim();
  return FINANCE_DRE_GROUP_SET.has(g) ? g : '';
}
