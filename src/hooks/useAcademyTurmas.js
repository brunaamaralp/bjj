import { useEffect, useState } from 'react';
import { Query } from 'appwrite';
import { databases, DB_ID, ACADEMIES_COL, CLASSES_COL } from '../lib/appwrite';
import { mapClassDoc } from '../lib/classes.js';
import { resolveAcademyTurmaLabels } from '../lib/academyTurmas.js';

function isClassesColConfigured() {
  return Boolean(String(CLASSES_COL || '').trim());
}

/**
 * Turmas da academia: collection `classes` (canônico) com fallback em settings.turmas.
 * @param {string|null|undefined} academyId
 */
export function useAcademyTurmas(academyId) {
  const [turmas, setTurmas] = useState(() => resolveAcademyTurmaLabels({}));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academyId) {
      setTurmas(resolveAcademyTurmaLabels({}));
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const tasks = [databases.getDocument(DB_ID, ACADEMIES_COL, academyId)];
        if (isClassesColConfigured()) {
          tasks.push(
            databases.listDocuments(DB_ID, CLASSES_COL, [
              Query.equal('academy_id', academyId),
              Query.limit(500),
            ])
          );
        }
        const results = await Promise.all(tasks);
        const doc = results[0];
        const classDocs = isClassesColConfigured()
          ? (results[1]?.documents || []).map(mapClassDoc).filter(Boolean)
          : [];
        if (!cancelled) {
          setTurmas(resolveAcademyTurmaLabels({ settingsRaw: doc.settings, classes: classDocs }));
        }
      } catch {
        if (!cancelled) setTurmas(resolveAcademyTurmaLabels({}));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return { turmas, loading };
}
