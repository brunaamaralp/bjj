/**
 * Consultas plan_freezes (fonte de verdade de intervalos de trancamento).
 */
import { Query } from 'node-appwrite';

function planFreezesCol() {
  return (
    process.env.VITE_APPWRITE_PLAN_FREEZES_COLLECTION_ID ||
    process.env.PLAN_FREEZES_COLLECTION_ID ||
    process.env.APPWRITE_PLAN_FREEZES_COLLECTION_ID ||
    ''
  );
}

/**
 * Lista registros plan_freezes do aluno (ordenados por start_date desc).
 * @returns {Promise<object[]>}
 */
export async function fetchActiveFreezesForStudent(databases, dbId, { studentId, academyId }) {
  const col = planFreezesCol();
  const sid = String(studentId || '').trim();
  const aid = String(academyId || '').trim();
  if (!col || !sid || !aid || !databases || !dbId) return [];

  const res = await databases.listDocuments(dbId, col, [
    Query.equal('lead_id', sid),
    Query.equal('academy_id', aid),
    Query.orderDesc('start_date'),
    Query.limit(50),
  ]);
  return res.documents || [];
}

export function planFreezesCollectionId() {
  return planFreezesCol();
}
