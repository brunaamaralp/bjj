import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('inboxMediaUtils', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_APPWRITE_INBOX_MEDIA_BUCKET_ID', 'inbox_media');
    vi.stubEnv('VITE_APPWRITE_ENDPOINT', 'https://appwrite.test/v1');
    vi.stubEnv('VITE_APPWRITE_PROJECT_ID', 'proj');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('builds view URL from storage file id', async () => {
    const { buildInboxMediaViewUrl } = await import('../lib/inboxMediaUtils.js');
    expect(buildInboxMediaViewUrl('file-abc')).toBe(
      'https://appwrite.test/v1/storage/buckets/inbox_media/files/file-abc/view?project=proj'
    );
  });

  it('prefers storage file id over expired zapster url', async () => {
    const { inboxMessageMediaUrl } = await import('../lib/inboxMediaUtils.js');
    const url = inboxMessageMediaUrl({
      storageFileId: 'stored-1',
      mediaUrl: 'https://zapster.example/expired.ogg',
    });
    expect(url).toBe(
      'https://appwrite.test/v1/storage/buckets/inbox_media/files/stored-1/view?project=proj'
    );
  });
});
