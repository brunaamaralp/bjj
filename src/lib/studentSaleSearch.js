import { searchStudentsForSaleApi } from './studentsApi.js';

/**
 * Busca alunos por nome ou telefone para o checkout de vendas.
 * Usa API autenticada (mesmo padrão de find-by-phone), não o client Appwrite.
 */
export async function searchStudentsForSale(academyId, rawQuery, { limit = 8 } = {}) {
  const aid = String(academyId || '').trim();
  const q = String(rawQuery || '').trim();
  if (!aid || q.length < 2) return [];

  try {
    return await searchStudentsForSaleApi(q, aid, { limit });
  } catch {
    return [];
  }
}
