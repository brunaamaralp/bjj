import { Query } from 'appwrite';
import { databases, DB_ID, STUDENTS_COL } from './appwrite.js';

function mapStudentSaleHit(doc) {
  const nome = String(doc?.name || doc?.nome || doc?.$id || '').trim();
  return {
    id: doc.$id,
    nome,
    name: nome,
    phone: String(doc?.phone || '').trim(),
    plan: doc?.plan || '',
    plan_price: doc?.plan_price,
    preferredPaymentMethod: doc?.preferredPaymentMethod || '',
    preferredPaymentAccount: doc?.preferredPaymentAccount || '',
  };
}

async function listStudents(academyKey, academyId, searchQuery, { limit = 8 } = {}) {
  const queries = [Query.equal(academyKey, academyId), Query.limit(limit)];

  const digits = String(searchQuery || '').replace(/\D/g, '');
  if (digits.length >= 4) {
    queries.push(Query.contains('phone', digits));
  } else {
    queries.push(Query.contains('name', searchQuery));
  }

  const res = await databases.listDocuments(DB_ID, STUDENTS_COL, queries);
  return (res.documents || []).map(mapStudentSaleHit);
}

/**
 * Busca alunos por nome ou telefone para o checkout de vendas.
 * Usa Query.contains (mesmo padrão da página Alunos), não Query.search.
 */
export async function searchStudentsForSale(academyId, rawQuery, { limit = 8 } = {}) {
  const aid = String(academyId || '').trim();
  const q = String(rawQuery || '').trim();
  if (!aid || q.length < 2 || !DB_ID || !STUDENTS_COL) return [];

  try {
    return await listStudents('academyId', aid, q, { limit });
  } catch {
    try {
      return await listStudents('academy_id', aid, q, { limit });
    } catch {
      return [];
    }
  }
}
