import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  enrichInboundMedia: vi.fn(),
  patchAssistantMessageMedia: vi.fn(),
  resolveZapsterMessageForBackfill: vi.fn(),
}));

vi.mock('../../lib/server/inboxMediaService.js', () => ({
  enrichInboundMedia: (...args) => mocks.enrichInboundMedia(...args),
}));

vi.mock('../../lib/server/conversationsStore.js', () => ({
  patchAssistantMessageMedia: (...args) => mocks.patchAssistantMessageMedia(...args),
}));

vi.mock('../../lib/server/zapsterMessagesApi.js', () => ({
  pickZapsterMessageCaption: (msg) => String(msg?.content?.text || msg?.caption || '').trim(),
  pickZapsterMessageMediaUrl: (msg) => String(msg?.content?.media?.url || '').trim(),
  pickZapsterMessageMime: () => 'image/jpeg',
  resolveZapsterMessageForBackfill: (...args) => mocks.resolveZapsterMessageForBackfill(...args),
}));

describe('backfillOutboundSentMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enrichInboundMedia.mockResolvedValue({
      mediaUrl: 'https://appwrite/view/file1',
      storageFileId: 'file1',
      media_stored: true,
      mimeType: 'image/jpeg',
    });
    mocks.patchAssistantMessageMedia.mockResolvedValue({ ok: true });
  });

  it('atualiza mensagem quando Zapster devolve URL de mídia', async () => {
    mocks.resolveZapsterMessageForBackfill.mockResolvedValue({
      id: 'msg-1',
      content: { media: { url: 'https://zapster/tmp.jpg' }, text: 'foto' },
    });

    const { backfillOutboundSentMedia } = await import('../../lib/server/outboundSentMediaBackfill.js');
    const result = await backfillOutboundSentMedia({
      academyId: 'acad-1',
      docId: 'conv-1',
      messageId: 'msg-1',
      messageType: 'image',
      instanceId: 'inst-1',
    });

    expect(result.ok).toBe(true);
    expect(mocks.enrichInboundMedia).toHaveBeenCalled();
    expect(mocks.patchAssistantMessageMedia).toHaveBeenCalledWith(
      'conv-1',
      'msg-1',
      expect.objectContaining({
        type: 'image',
        content: 'foto',
        media_stored: true,
      }),
      { onlyIfPlaceholder: true }
    );
  });

  it('retorna media_not_available quando Zapster não entrega URL', async () => {
    vi.useFakeTimers();
    mocks.resolveZapsterMessageForBackfill.mockResolvedValue(null);

    const { backfillOutboundSentMedia } = await import('../../lib/server/outboundSentMediaBackfill.js');
    const promise = backfillOutboundSentMedia({
      academyId: 'acad-1',
      docId: 'conv-1',
      messageId: 'msg-1',
      messageType: 'image',
      instanceId: 'inst-1',
    });

    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result).toEqual({ ok: false, reason: 'media_not_available' });
    expect(mocks.patchAssistantMessageMedia).not.toHaveBeenCalled();
  });
});
