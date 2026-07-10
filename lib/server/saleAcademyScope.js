/**
 * Validação de escopo de academia em documentos de venda (camelCase + snake_case legado).
 */

export function saleAcademyIds(saleDoc) {
  const camel = String(saleDoc?.academyId || '').trim();
  const snake = String(saleDoc?.academy_id || '').trim();
  return [...new Set([camel, snake].filter(Boolean))];
}

/** Venda pertence à academia ativa (header x-academy-id). */
export function saleBelongsToAcademy(saleDoc, academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) return false;
  const ids = saleAcademyIds(saleDoc);
  if (!ids.length) return false;
  return ids.includes(aid);
}

export function filterSalesForAcademy(docs, academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) return [];
  return (docs || []).filter((d) => saleBelongsToAcademy(d, aid));
}
