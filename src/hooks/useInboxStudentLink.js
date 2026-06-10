import { useCallback, useMemo } from 'react';
import { useToast } from './useToast';
import { filterStudentCandidates } from '../lib/studentSearchFilter.js';
import { resolvePipelineLeadToStudent } from '../lib/resolvePipelineLeadToStudent.js';
import { unlinkInboxConversationLead } from '../lib/unlinkInboxConversationLead.js';

/**
 * Triagem (descartar), vincular aluno e candidatos do painel de contexto.
 */
export function useInboxStudentLink({
  students,
  leadSearch,
  selectedPhone,
  activeContactLead,
  dismissTriageLead,
  academyId,
  linkingLead,
  setLinkingLead,
  setLeadPanel,
  setLeadSearch,
  setDismissTriageLead,
  setDetailsOpen,
  setContextOpen,
  isMobile,
  isNarrowDesktop,
  deleteLead,
  fetchStudents,
  loadList,
  setSelected,
  setItems,
}) {
  const toast = useToast();

  const studentCandidates = useMemo(
    () => filterStudentCandidates(students, { query: leadSearch, phoneHint: selectedPhone, limit: 20 }),
    [students, leadSearch, selectedPhone]
  );

  const executeDismissTriage = useCallback(async () => {
    const lead = dismissTriageLead;
    const id = String(lead?.id || '').trim();
    const phone = String(selectedPhone || '').trim();
    if (!id) return;
    setLinkingLead(true);
    try {
      await deleteLead(id);
      if (phone && academyId) await unlinkInboxConversationLead({ phone, academyId });
      setSelected((prev) => {
        if (!prev || String(prev.phone || '').trim() !== phone) return prev;
        return { ...prev, lead_id: null, lead_name: '' };
      });
      setItems((prev) =>
        (Array.isArray(prev) ? prev : []).map((it) => {
          if (String(it?.phone_number || '').trim() !== phone) return it;
          return { ...it, lead_id: null, lead_name: '', lead: null };
        })
      );
      toast.success('Contato descartado');
      setDismissTriageLead(null);
      setLeadPanel(null);
    } catch (e) {
      toast.error(e, 'delete');
    } finally {
      setLinkingLead(false);
    }
  }, [
    academyId,
    deleteLead,
    dismissTriageLead,
    selectedPhone,
    setDismissTriageLead,
    setItems,
    setLeadPanel,
    setLinkingLead,
    setSelected,
    toast,
  ]);

  const handleOpenLinkStudent = useCallback(() => {
    setLeadSearch('');
    setLeadPanel('link_student');
    if (isMobile || isNarrowDesktop) {
      setDetailsOpen(true);
    } else {
      setContextOpen(true);
    }
    void fetchStudents({ reset: true });
  }, [fetchStudents, isMobile, isNarrowDesktop, setContextOpen, setDetailsOpen, setLeadPanel, setLeadSearch]);

  const handleInboxLinkStudentConfirm = useCallback(
    async (studentId) => {
      const lead = activeContactLead;
      const leadId = String(lead?.id || '').trim();
      const sid = String(studentId || '').trim();
      const phone = String(selectedPhone || '').trim();
      if (!leadId || !sid || linkingLead) return;

      const student = (Array.isArray(students) ? students : []).find((s) => String(s?.id || '').trim() === sid);
      const studentName = String(student?.name || '').trim();

      setLinkingLead(true);
      try {
        await resolvePipelineLeadToStudent({
          lead,
          studentId: sid,
          academyId,
          deleteLead,
        });
        setSelected((prev) => {
          if (!prev || String(prev.phone || '').trim() !== phone) return prev;
          return { ...prev, lead_id: sid, lead_name: studentName || prev.lead_name };
        });
        setItems((prev) =>
          (Array.isArray(prev) ? prev : []).map((it) => {
            if (String(it?.phone_number || '').trim() !== phone) return it;
            return { ...it, lead_id: sid, lead_name: studentName || String(it?.lead_name || '').trim(), lead: null };
          })
        );
        await loadList({ reset: true, silent: true });
        toast.success('Aluno vinculado — removido do funil');
        setLeadPanel(null);
        setLeadSearch('');
        setDetailsOpen(false);
      } catch (e) {
        toast.error(e, 'action');
      } finally {
        setLinkingLead(false);
      }
    },
    [
      academyId,
      activeContactLead,
      deleteLead,
      linkingLead,
      loadList,
      selectedPhone,
      setDetailsOpen,
      setItems,
      setLeadPanel,
      setLeadSearch,
      setLinkingLead,
      setSelected,
      students,
      toast,
    ]
  );

  return {
    studentCandidates,
    executeDismissTriage,
    handleOpenLinkStudent,
    handleInboxLinkStudentConfirm,
  };
}
