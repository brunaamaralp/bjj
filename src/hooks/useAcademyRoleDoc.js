import { useEffect, useMemo, useState } from 'react';
import { useLeadStore } from '../store/useLeadStore.js';
import { databases, DB_ID, ACADEMIES_COL } from '../lib/appwrite.js';

/**
 * Documento mínimo da academia para RBAC (ownerId + teamId).
 * Usa academyList; se faltar ownerId/teamId, busca o doc no Appwrite.
 */
export function useAcademyRoleDoc() {
  const academyId = useLeadStore((s) => s.academyId);
  const academyList = useLeadStore((s) => s.academyList);
  const teamIdFromStore = useLeadStore((s) => s.teamId);
  const [fetched, setFetched] = useState(null);

  const fromList = useMemo(() => {
    if (!academyId) return null;
    return (academyList || []).find((x) => x.id === academyId) || null;
  }, [academyList, academyId]);

  const listOwnerId = String(fromList?.ownerId || '').trim();
  const listTeamId = String(fromList?.teamId || teamIdFromStore || '').trim();
  const needsFetch = Boolean(academyId && !listOwnerId && !listTeamId);

  useEffect(() => {
    if (!needsFetch || !academyId || !ACADEMIES_COL || !DB_ID) {
      setFetched(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const doc = await databases.getDocument(DB_ID, ACADEMIES_COL, academyId);
        if (cancelled) return;
        setFetched({
          ownerId: String(doc.ownerId || ''),
          teamId: String(doc.teamId || ''),
        });
      } catch {
        if (!cancelled) setFetched(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [needsFetch, academyId]);

  return useMemo(() => {
    if (!academyId) return null;
    const ownerId = listOwnerId || String(fetched?.ownerId || '');
    const teamId = listTeamId || String(fetched?.teamId || '');
    if (!ownerId && !teamId) return null;
    return { ownerId, teamId };
  }, [academyId, listOwnerId, listTeamId, fetched]);
}
