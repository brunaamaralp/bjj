import { describe, it, expect } from 'vitest';
import {
  extractWhatsAppGroupContext,
  groupParticipantMessageFields,
  resolveInboundConversationFromMessage,
  pickZapsterParticipantName,
} from '../../lib/whatsappGroupContext.js';

describe('whatsappGroupContext', () => {
  const groupMsg = {
    type: 'text',
    content: { text: 'Olá grupo' },
    sender: {
      id: '5511999887766',
      name: 'Maria Silva',
      type: 'chat',
    },
    recipient: {
      id: '120363402123456789',
      name: 'Turma Manhã',
      type: 'group',
      profile_picture: 'https://example.com/group.jpg',
    },
  };

  it('extractWhatsAppGroupContext identifica grupo pelo recipient.type', () => {
    const ctx = extractWhatsAppGroupContext(groupMsg);
    expect(ctx).toEqual({
      groupId: '120363402123456789',
      groupName: 'Turma Manhã',
      groupPicture: 'https://example.com/group.jpg',
      participantPhone: '5511999887766',
      participantName: 'Maria Silva',
    });
  });

  it('resolveInboundConversationFromMessage usa groupId como phone', () => {
    const conv = resolveInboundConversationFromMessage(groupMsg);
    expect(conv.isGroup).toBe(true);
    expect(conv.phone).toBe('120363402123456789');
    expect(conv.contactName).toBe('Turma Manhã');
    expect(conv.participantName).toBe('Maria Silva');
  });

  it('resolveInboundConversationFromMessage para DM usa sender', () => {
    const conv = resolveInboundConversationFromMessage({
      sender: { id: '5511888777666', name: 'João' },
      recipient: { id: '5511999999999', type: 'chat' },
    });
    expect(conv.isGroup).toBe(false);
    expect(conv.phone).toBe('5511888777666');
    expect(conv.contactName).toBe('João');
  });

  it('groupParticipantMessageFields inclui sender_name', () => {
    expect(
      groupParticipantMessageFields({ participantName: 'Ana', participantPhone: '5511000000000' })
    ).toEqual({
      sender_name: 'Ana',
      sender_phone: '5511000000000',
    });
  });

  it('pickZapsterParticipantName retorna nome do participante', () => {
    expect(pickZapsterParticipantName(groupMsg)).toBe('Maria Silva');
  });
});
