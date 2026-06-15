/**
 * Factory de documentos Appwrite fake para testes de integração.
 */

/** @param {Record<string, unknown>} [overrides] */
export function fakeAcademyDoc(overrides = {}) {
  return {
    $id: 'acad-1',
    status: 'active',
    ia_ativa: true,
    zapster_instance_id: 'inst-1',
    zapsterInstanceId: 'inst-1',
    ownerId: 'user-owner-1',
    teamId: 'team-1',
    faq_data: '[]',
    ...overrides,
  };
}

/** @param {Record<string, unknown>} [overrides] */
export function fakeConversationDoc(overrides = {}) {
  const messages = overrides.messages ?? [];
  const messagesJson =
    typeof messages === 'string' ? messages : JSON.stringify(Array.isArray(messages) ? messages : []);
  const { messages: _m, ...rest } = overrides;
  return {
    $id: 'conv-1',
    academy_id: 'acad-1',
    phone_number: '5511999887766',
    unread_count: 2,
    human_handoff_until: '',
    archived: false,
    messages: messagesJson,
    messages_recent: messagesJson,
    updated_at: '2026-06-14T10:00:00.000Z',
    last_user_msg_at: '2026-06-14T10:00:00.000Z',
    last_read_at: '',
    ...rest,
  };
}

/** @param {Record<string, unknown>} [overrides] */
export function fakeLeadDoc(overrides = {}) {
  return {
    $id: 'lead-1',
    academyId: 'acad-1',
    name: 'Maria',
    phone: '5511999887766',
    status: 'Novo',
    ...overrides,
  };
}
