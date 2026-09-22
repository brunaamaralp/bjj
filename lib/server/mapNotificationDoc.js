/**
 * Mapeamento de documentos note_notifications → payload do sino.
 * Separado do handler HTTP para testes e evolução de tipos (profile_note, futuro targeting).
 */
export function mapNotificationDoc(d) {
  const type = String(d?.type || '').trim();
  const isSystem =
    type.startsWith('whatsapp_') || type === 'agent_send_failed' || type === 'inbound_persist_failed';
  const isProfileNote = type === 'profile_note';
  const bodySnapshot = String(d?.body || '').trim() || null;
  return {
    id: d.$id,
    note_id: d.note_id,
    conversation_id: d.conversation_id,
    lead_id: d.lead_id,
    lead_name: d.lead_name,
    phone_number: d.phone_number,
    created_by_name: d.created_by_name,
    created_by_user_id: d.created_by_user_id || null,
    created_at: d.created_at,
    type: type || null,
    title: isSystem || isProfileNote ? String(d.lead_name || '').trim() : null,
    body: isSystem ? String(d.created_by_name || '').trim() : bodySnapshot,
    action_url: String(d?.action_url || '').trim() || null,
    severity: String(d?.severity || '').trim() || null,
    is_system: isSystem,
    is_profile_note: isProfileNote,
  };
}
