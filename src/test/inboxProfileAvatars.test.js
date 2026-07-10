import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  findConversationDoc: vi.fn(),
  fetchZapsterRecipientProfile: vi.fn(),
}));

vi.mock('../../lib/server/conversationsStore.js', () => ({
  findConversationDoc: (...args) => mocks.findConversationDoc(...args),
}));

vi.mock('../../lib/server/zapsterRecipientProfile.js', () => ({
  fetchZapsterRecipientProfile: (...args) => mocks.fetchZapsterRecipientProfile(...args),
}));

describe('resolveInboxProfileAvatars', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reutiliza URL em cache sem chamar Zapster', async () => {
    mocks.findConversationDoc.mockResolvedValue({
      $id: 'conv-1',
      whatsapp_profile_image_url: 'https://cdn.example/a.jpg',
      whatsapp_profile_image_updated_at: new Date().toISOString(),
    });

    const { resolveInboxProfileAvatars } = await import('../../lib/server/inboxProfileAvatars.js');
    const { avatars, persists } = await resolveInboxProfileAvatars({
      academyId: 'acad-1',
      academyDoc: { zapster_instance_id: 'inst-1' },
      phones: ['5511999887766'],
    });

    expect(avatars['5511999887766']).toBe('https://cdn.example/a.jpg');
    expect(persists).toEqual([]);
    expect(mocks.fetchZapsterRecipientProfile).not.toHaveBeenCalled();
  });

  it('busca na Zapster quando não há foto salva', async () => {
    mocks.findConversationDoc.mockResolvedValue({ $id: 'conv-2' });
    mocks.fetchZapsterRecipientProfile.mockResolvedValue({
      profilePicture: 'https://zapster/pic.jpg',
      name: 'Maria',
    });

    const { resolveInboxProfileAvatars } = await import('../../lib/server/inboxProfileAvatars.js');
    const { avatars, persists } = await resolveInboxProfileAvatars({
      academyId: 'acad-1',
      academyDoc: { zapster_instance_id: 'inst-1' },
      phones: ['5511888776655'],
    });

    expect(avatars['5511888776655']).toBe('https://zapster/pic.jpg');
    expect(persists).toHaveLength(1);
    expect(persists[0].docId).toBe('conv-2');
  });

  it('usa docsByPhone e não chama findConversationDoc', async () => {
    mocks.fetchZapsterRecipientProfile.mockResolvedValue({
      profilePicture: 'https://zapster/preloaded.jpg',
      name: '',
    });

    const { resolveInboxProfileAvatars } = await import('../../lib/server/inboxProfileAvatars.js');
    const { avatars } = await resolveInboxProfileAvatars({
      academyId: 'acad-1',
      academyDoc: { zapster_instance_id: 'inst-1' },
      phones: ['5511999887766'],
      docsByPhone: { '5511999887766': { $id: 'conv-pre' } },
    });

    expect(avatars['5511999887766']).toBe('https://zapster/preloaded.jpg');
    expect(mocks.findConversationDoc).not.toHaveBeenCalled();
  });
});
