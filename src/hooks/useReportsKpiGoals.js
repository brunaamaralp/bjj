import { useEffect, useState } from 'react';
import { parseReportsKpiGoals } from '../../lib/reportsKpiGoals.js';
import { getAcademyDocument } from '../lib/getAcademyDocument.js';

export function useReportsKpiGoals(academyId) {
  const [goals, setGoals] = useState({});

  useEffect(() => {
    if (!academyId) return undefined;
    let alive = true;
    getAcademyDocument(academyId)
      .then((doc) => {
        if (alive) setGoals(parseReportsKpiGoals(doc?.settings));
      })
      .catch(() => {
        if (alive) setGoals({});
      });
    return () => {
      alive = false;
    };
  }, [academyId]);

  return academyId ? goals : {};
}
