import { useEffect } from 'react';

/**
 * Reseta painéis e rascunhos auxiliares ao trocar de conversa.
 */
export function useInboxPhoneChangeReset({
  selectedPhone,
  setLeadPanel,
  setLeadSearch,
  setLeadNameDraft,
  setDraftBeforeImprove,
}) {
  useEffect(() => {
    setLeadPanel(null);
    setLeadSearch('');
    setLeadNameDraft('');
    setDraftBeforeImprove(null);
  }, [selectedPhone, setLeadPanel, setLeadSearch, setLeadNameDraft, setDraftBeforeImprove]);
}
