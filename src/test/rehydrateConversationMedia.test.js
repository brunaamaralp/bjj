import { describe, it, expect, vi, beforeEach } from 'vitest';

const enrichInboundMedia = vi.fn();

vi.mock('../../lib/server/inboxMediaService.js', () => ({
  enrichInboundMedia,
}));

describe('rehydrateConversationMedia', () => {
  beforeEach(() => {
    vi.resetModules();
    enrichInboundMedia.mockReset();
  });

  it('persiste mídia pendente e ignora já armazenada', async () => {
    enrichInboundMedia.mockResolvedValue({
      mediaUrl: 'https://appwrite.test/file/view',
      storageFileId: 'f1',
      media_stored: true,
      mimeType: 'image/jpeg',
    });

    const { rehydrateConversationMediaMessages } = await import('../../lib/server/rehydrateConversationMedia.js');
    const { messages, attempted, updated } = await rehydrateConversationMediaMessages(
      [
        { role: 'user', content: '[imagem]', type: 'image', mediaUrl: 'https://zapster/tmp.jpg', media_stored: false },
        { role: 'user', content: 'ok', type: 'image', mediaUrl: 'https://appwrite/stored', storageFileId: 'x', media_stored: true },
      ],
      { academyId: 'ac1' }
    );

    expect(attempted).toBe(1);
    expect(updated).toBe(1);
    expect(messages[0].storageFileId).toBe('f1');
    expect(messages[0].media_stored).toBe(true);
    expect(messages[1].storageFileId).toBe('x');
  });
});
