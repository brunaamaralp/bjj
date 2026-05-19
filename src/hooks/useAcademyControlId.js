import { useEffect, useState } from 'react';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite';
import { readControlIdConfig } from '../../lib/controlidSettings.js';

export function useAcademyControlId(academyId) {
  const [config, setConfig] = useState(() => readControlIdConfig(null));
  const [loading, setLoading] = useState(Boolean(academyId));

  useEffect(() => {
    if (!academyId) {
      setConfig(readControlIdConfig(null));
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (!cancelled) setConfig(readControlIdConfig(doc.settings));
      } catch {
        if (!cancelled) setConfig(readControlIdConfig(null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  return { ...config, loading };
}
