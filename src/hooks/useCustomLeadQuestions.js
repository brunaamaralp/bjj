import { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { normalizeCustomLeadQuestions } from '../lib/customLeadQuestions.js';

/**
 * Carrega perguntas customizadas da academia.
 * @param {string} academyId
 */
export function useCustomLeadQuestions(academyId) {
  const aid = String(academyId || '').trim();
  const [fetchState, setFetchState] = useState({ key: '', questions: [], loading: false });

  useEffect(() => {
    if (!aid) return undefined;
    let cancelled = false;
    databases
      .getDocument(DB_ID, ACADEMIES_COL, aid)
      .then((doc) => {
        if (cancelled) return;
        const normalized = normalizeCustomLeadQuestions(doc.customLeadQuestions);
        setFetchState({ key: aid, questions: normalized.questions, loading: false });
        if (normalized.migrated) {
          databases
            .updateDocument(DB_ID, ACADEMIES_COL, aid, {
              customLeadQuestions: JSON.stringify(normalized.questions),
            })
            .catch(() => void 0);
        }
      })
      .catch(() => {
        if (!cancelled) setFetchState({ key: aid, questions: [], loading: false });
      });
    return () => {
      cancelled = true;
    };
  }, [aid]);

  if (!aid) return { questions: [], loading: false };
  if (fetchState.key !== aid) return { questions: [], loading: true };
  return { questions: fetchState.questions, loading: fetchState.loading };
}
