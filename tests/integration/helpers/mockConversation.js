import { humanHandoffUntilFromMs } from '../../../lib/humanHandoffUntil.js';
import { fakeAcademyDoc, fakeConversationDoc } from './mockAppwrite.js';

export const ACADEMY_ACTIVE = fakeAcademyDoc();

export const CONVERSATION_UNREAD = fakeConversationDoc({
  unread_count: 3,
  messages: [
    { role: 'user', content: 'Olá', timestamp: '2026-06-14T09:00:00.000Z', message_id: 'msg-u1' },
    { role: 'assistant', content: 'Oi!', timestamp: '2026-06-14T09:01:00.000Z' },
  ],
});

export const CONVERSATION_ALREADY_READ = fakeConversationDoc({
  unread_count: 0,
  last_read_at: '2026-06-14T11:00:00.000Z',
});

export function conversationWithHandoff(hoursFromNow = 6) {
  const until = humanHandoffUntilFromMs(Date.now() + hoursFromNow * 3600000);
  return fakeConversationDoc({
    human_handoff_until: until || '',
    unread_count: 1,
  });
}

export const CONVERSATION_OTHER_ACADEMY = fakeConversationDoc({
  $id: 'conv-other',
  academy_id: 'acad-2',
  phone_number: '5511999887766',
});

export const GROUP_PHONE = '120363402123456789';

export function inboundTextPayload(overrides = {}) {
  return {
    event: 'message.received',
    instance_id: 'inst-1',
    message: {
      id: 'msg-in-1',
      type: 'text',
      sender: { id: '5511999887766', name: 'Maria' },
      content: { text: 'Quero informações' },
      ...overrides.message,
    },
    ...overrides,
  };
}

export function inboundGroupPayload() {
  return inboundTextPayload({
    message: {
      id: 'msg-group-1',
      type: 'text',
      sender: { id: '5511999887766', name: 'Maria' },
      recipient: { id: GROUP_PHONE, name: 'Turma', type: 'group' },
      content: { text: 'Mensagem no grupo' },
    },
  });
}
