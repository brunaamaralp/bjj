import { useEffect, useMemo, useState } from 'react';
import { fetchTeamMemberships } from './teamApi.js';
import { normalizeReportsOperatorTeam } from './reportsOperatorTeam.js';
import { useStaffRosterStore, isStaffRosterConfigured } from '../store/staffRosterStore.js';
import { buildLessonStaffPickerOptions } from '../../lib/staffRoster.js';

/**
 * Opções de professor/instrutor (Equipe + roster), mesmo padrão das aulas da grade.
 * @param {string} academyId
 */
export function useExperimentalProfessorOptions(academyId) {
  const [team, setTeam] = useState([]);
  const roster = useStaffRosterStore((s) => s.roster);
  const fetchRoster = useStaffRosterStore((s) => s.fetchRoster);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    if (!aid) {
      setTeam([]);
      return undefined;
    }
    let cancelled = false;
    fetchTeamMemberships(aid)
      .then((data) => {
        if (!cancelled) setTeam(normalizeReportsOperatorTeam(data));
      })
      .catch(() => {
        if (!cancelled) setTeam([]);
      });
    return () => {
      cancelled = true;
    };
  }, [academyId]);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    if (!aid || !isStaffRosterConfigured()) return;
    void fetchRoster(aid, { activeOnly: true });
  }, [academyId, fetchRoster]);

  const options = useMemo(
    () => buildLessonStaffPickerOptions({ teamMembers: team, roster }),
    [team, roster]
  );

  return options;
}
