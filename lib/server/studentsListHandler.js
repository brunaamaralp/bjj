import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import {
  buildStudentsListDocumentQueries,
  parseStudentsListQueryParams,
  resolveStudentTurmaKey,
} from './studentsListQuery.js';
import { apiErro } from './friendlyError.js';

/**
 * GET /api/students/list — listagem paginada com campos mínimos.
 */
export async function handleStudentsList(req, res, { databases, dbId, studentsCol, academyId }) {
  if (req.method !== 'GET') {
    return res.status(405).json({ sucesso: false, erro: 'Método não permitido' });
  }

  const opts = parseStudentsListQueryParams(req.query || {});
  const turmaKey = resolveStudentTurmaKey();

  try {
    const queries = buildStudentsListDocumentQueries(academyId, opts, turmaKey);
    let response;
    try {
      response = await databases.listDocuments(dbId, studentsCol, queries);
    } catch (selectErr) {
      const withoutSelect = buildStudentsListDocumentQueries(academyId, opts, turmaKey, { withSelect: false });
      console.warn('[students/list] select failed, retrying without select:', selectErr?.message || selectErr);
      response = await databases.listDocuments(dbId, studentsCol, withoutSelect);
    }
    const total = typeof response.total === 'number' ? response.total : null;
    const docs = response.documents || [];
    const items = docs.map((doc) => mapAppwriteDocToStudent(doc));
    const lastId = docs.length ? docs[docs.length - 1].$id : null;
    const pageFull = docs.length === opts.limit;

    return res.status(200).json({
      sucesso: true,
      items,
      next_cursor: pageFull && lastId ? String(lastId) : null,
      total,
    });
  } catch (e) {
    console.error('[students/list]', academyId, e?.message || e);
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'load') });
  }
}
