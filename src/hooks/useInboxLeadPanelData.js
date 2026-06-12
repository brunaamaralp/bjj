import { useEffect } from 'react';

/**
 * Carrega leads/alunos sob demanda quando painéis do contexto abrem.
 */
export function useInboxLeadPanelData({
  leadPanel,
  leadsLoading,
  leadsForAssociate,
  fetchLeads,
  studentsLoading,
  students,
  fetchStudents,
}) {
  useEffect(() => {
    if (leadPanel !== 'associate') return;
    if (leadsLoading) return;
    if (Array.isArray(leadsForAssociate) && leadsForAssociate.length > 0) return;
    fetchLeads();
  }, [leadPanel, leadsLoading, leadsForAssociate, fetchLeads]);

  useEffect(() => {
    if (leadPanel !== 'link_student') return;
    if (studentsLoading) return;
    if (Array.isArray(students) && students.length > 0) return;
    void fetchStudents({ reset: true });
  }, [leadPanel, studentsLoading, students, fetchStudents]);
}
