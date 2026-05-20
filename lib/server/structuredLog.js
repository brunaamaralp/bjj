/**
 * Logs JSON com campos fixos para observabilidade (Inbox / agente).
 */
export function logStructured(event, fields = {}) {
  const row = {
    event: String(event || 'unknown'),
    ts: new Date().toISOString(),
    academy_id: fields.academy_id ?? fields.academyId ?? null,
    phone: fields.phone ?? null,
    conversation_id: fields.conversation_id ?? fields.conversationId ?? null,
    message_id: fields.message_id ?? fields.messageId ?? null,
    error: fields.error != null ? String(fields.error) : null,
    ...fields,
  };
  const line = JSON.stringify(row);
  if (row.error || String(event || '').includes('fail')) {
    console.error(line);
  } else {
    console.log(line);
  }
  return row;
}
