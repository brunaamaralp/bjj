import { useState, useEffect } from 'react';
import { createSessionJwt } from '../lib/appwrite';

/**
 * Lista etiquetas da academia via GET /api/labels.
 * @param {string | null | undefined} academyId
 * @param {{ onLoadError?: () => void }} [options]
 */
export function useAcademyLabels(academyId, options = {}) {
  const [allLabels, setAllLabels] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!academyId) {
      setAllLabels([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const token = await createSessionJwt();
        const res = await fetch('/api/labels', {
          headers: {
            Authorization: `Bearer ${token}`,
            'x-academy-id': academyId,
          },
        });
        const data = await res.json();
        if (cancelled) return;
        if (data?.sucesso) {
          setAllLabels(data.labels || []);
        } else {
          setAllLabels([]);
          options.onLoadError?.();
        }
      } catch {
        if (!cancelled) {
          setAllLabels([]);
          options.onLoadError?.();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // onLoadError intentionally omitted — callers should pass stable callbacks (e.g. toast from store)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [academyId]);

  return { allLabels, labelsLoading: loading };
}
