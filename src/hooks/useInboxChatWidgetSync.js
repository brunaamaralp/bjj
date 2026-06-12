import { useEffect } from 'react';
import { useChatWidgetStore } from '../store/useChatWidgetStore.js';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';
import {
  buildInboxDisplayNameArgs,
  pickInboxDisplayName as pickDisplayName,
} from '../lib/inboxContactDisplay.js';

/**
 * Mantém telefone do Inbox e do chat widget flutuante sincronizados quando pinado.
 */
export function useInboxChatWidgetSync({
  selectedPhone,
  setSelectedPhone,
  selected,
  activeContactLead = null,
  normalizePhone,
}) {
  const switchConversation = useChatWidgetStore((s) => s.switchConversation);
  const isWidgetPinned = useChatWidgetStore((s) => s.isPinned);
  const widgetActivePhone = useChatWidgetStore((s) => s.activePhone);

  useEffect(() => {
    if (!isWidgetPinned) return;
    const phone = normalizePhone(selectedPhone);
    const widgetPhone = primaryInboxPhone(widgetActivePhone);
    if (!phone || phone === widgetPhone) return;
    const leadId = String(selected?.lead_id || '').trim();
    const name = pickDisplayName(
      buildInboxDisplayNameArgs({
        lead: activeContactLead,
        leadName: selected?.lead_name,
        manualContactName: selected?.contact_name,
        whatsappProfileName: selected?.whatsapp_profile_name,
        phone,
      })
    );
    switchConversation({ phone, leadId, leadName: name });
  }, [selectedPhone, selected, activeContactLead, isWidgetPinned, widgetActivePhone, switchConversation, normalizePhone]);

  useEffect(() => {
    const widgetPhone = primaryInboxPhone(widgetActivePhone);
    const cur = normalizePhone(selectedPhone);
    if (!widgetPhone || widgetPhone === cur) return;
    setSelectedPhone(widgetPhone);
  }, [widgetActivePhone, selectedPhone, setSelectedPhone, normalizePhone]);
}
