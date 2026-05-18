import { salesFetch } from './salesApi.js';

/**
 * Vendas de produto vinculadas ao aluno (SALES + itens expandidos).
 * @param {string} alunoId
 * @param {{ includeCancelled?: boolean, limit?: number }} [opts]
 */
export async function getSalesByStudent(alunoId, opts = {}) {
  const id = String(alunoId || '').trim();
  if (!id) return [];

  const params = new URLSearchParams();
  params.set('route', 'sales_by_student');
  params.set('aluno_id', id);
  if (opts.includeCancelled) params.set('include_cancelled', 'true');
  if (opts.limit) params.set('limit', String(opts.limit));

  const data = await salesFetch(`/api/leads?${params.toString()}`);
  return data.sales || [];
}
