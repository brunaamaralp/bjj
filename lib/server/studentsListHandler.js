import { mapAppwriteDocToStudent } from '../../src/lib/mapAppwriteStudentDoc.js';
import {
  filterStudentsListItems,
  listStudentsDocumentsWithFallback,
  parseStudentsListQueryParams,
  resolveStudentTurmaKey,
} from './studentsListQuery.js';
import { apiErro, logApiError } from './friendlyError.js';

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
    const { documents, total, postFilterStatus } = await listStudentsDocumentsWithFallback(
      databases,
      dbId,
      studentsCol,
      academyId,
      opts,
      turmaKey
    );
    let items = documents.map((doc) => mapAppwriteDocToStudent(doc));
    if (postFilterStatus) {
      items = filterStudentsListItems(items, opts.studentStatus);
    }
    const lastId = documents.length ? documents[documents.length - 1].$id : null;
    const pageFull = documents.length === opts.limit;

    return res.status(200).json({
      sucesso: true,
      items,
      next_cursor: pageFull && lastId ? String(lastId) : null,
      total,
    });
  } catch (e) {
    logApiError('students/list', e);
    return res.status(500).json({ sucesso: false, erro: apiErro(e, 'load') });
  }
}
