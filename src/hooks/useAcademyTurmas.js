import { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { DEFAULT_ACADEMY_TURMAS, readAcademyTurmas } from '../lib/academyTurmas.js';

/**
 * Turmas configuradas em academy.settings.turmas.
 * @param {string|null|undefined} academyId
 */
export function useAcademyTurmas(academyId) {
  const [turmas, setTurmas] = useState(() => [...DEFAULT_ACADEMY_TURMAS]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academyId) {
      setTurmas([...DEFAULT_ACADEMY_TURMAS]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (!cancelled) setTurmas(readAcademyTurmas(doc.settings));
      } catch {
        if (!cancelled) setTurmas([...DEFAULT_ACADEMY_TURMAS]);
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
