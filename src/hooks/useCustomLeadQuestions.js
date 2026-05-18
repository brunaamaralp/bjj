import { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { normalizeCustomLeadQuestions } from '../lib/customLeadQuestions.js';

/**
 * Carrega perguntas customizadas da academia.
 * @param {string} academyId
 */
export function useCustomLeadQuestions(academyId) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    if (!aid) {
      setQuestions([]);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    databases
      .getDocument(DB_ID, ACADEMIES_COL, aid)
      .then((doc) => {
        if (cancelled) return;
        const normalized = normalizeCustomLeadQuestions(doc.customLeadQuestions);
        setQuestions(normalized.questions);
        if (normalized.migrated) {
          databases
            .updateDocument(DB_ID, ACADEMIES_COL, aid, {
              customLeadQuestions: JSON.stringify(normalized.questions),
            })
            .catch(() => void 0);
        }
      })
      .catch(() => {
        if (!cancelled) setQuestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return { questions, loading };
}
