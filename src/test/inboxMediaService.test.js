import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  createFile: vi.fn().mockResolvedValue({ $id: 'file-abc' })
}));

vi.mock('node-appwrite', () => ({
  Client: vi.fn(function MockClient() {
    this.setEndpoint = () => this;
    this.setProject = () => this;
    this.setKey = () => this;
    return this;
  }),
  Storage: vi.fn(function MockStorage() {
    this.createFile = storageMocks.createFile;
    return this;
  }),
  ID: { unique: () => 'unique-id' },
  Permission: { read: (role) => `read(${role})` },
  Role: { any: () => 'any' }
}));

vi.mock('node-appwrite/file', () => ({
  InputFile: {
    fromBuffer: vi.fn((buf, name, mime) => ({ buf, name, mime }))
  }
}));

describe('inboxMediaService', () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    storageMocks.createFile.mockClear();
    process.env.APPWRITE_INBOX_MEDIA_BUCKET_ID = 'inbox_media';
    process.env.APPWRITE_API_KEY = 'key';
    process.env.APPWRITE_PROJECT_ID = 'proj';
    process.env.APPWRITE_ENDPOINT = 'https://appwrite.test/v1';
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.unstubAllGlobals();
  });

  it('retorna null quando bucket não está configurado', async () => {
    delete process.env.APPWRITE_INBOX_MEDIA_BUCKET_ID;
    const { downloadAndStoreMedia } = await import('../../lib/server/inboxMediaService.js');
    const out = await downloadAndStoreMedia({
      mediaUrl: 'https://cdn.example/a.jpg',
      mimeType: 'image/jpeg',
      messageId: 'm1',
      academyId: 'a1'
    });
    expect(out).toBeNull();
    expect(storageMocks.createFile).not.toHaveBeenCalled();
  });

  it('faz upload e retorna URL permanente', async () => {
    const body = new Uint8Array([1, 2, 3]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: (k) => (k === 'content-length' ? String(body.length) : null) },
        arrayBuffer: async () => body.buffer
      })
    );

    const { downloadAndStoreMedia } = await import('../../lib/server/inboxMediaService.js');
    const out = await downloadAndStoreMedia({
      mediaUrl: 'https://cdn.example/a.jpg',
      mimeType: 'image/jpeg',
      messageId: 'msg-1',
      academyId: 'acad-1'
    });

    expect(out).toEqual({
      storageFileId: 'file-abc',
      permanentUrl: 'https://appwrite.test/v1/storage/buckets/inbox_media/files/file-abc/view?project=proj',
      mimeType: 'image/jpeg'
    });
    expect(storageMocks.createFile).toHaveBeenCalledWith(
      'inbox_media',
      'unique-id',
      expect.objectContaining({ name: expect.stringMatching(/acad-1_msg-1_\d+\.jpg/) }),
      expect.any(Array)
    );
  });

  it('enrichInboundMedia usa URL original quando download falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));

    const { enrichInboundMedia } = await import('../../lib/server/inboxMediaService.js');
    const out = await enrichInboundMedia({
      mediaUrl: 'https://zapster.example/tmp.ogg',
      mimeType: 'audio/ogg',
      messageId: 'm2',
      academyId: 'a2'
    });

    expect(out.mediaUrl).toBe('https://zapster.example/tmp.ogg');
    expect(out.media_stored).toBe(false);
    expect(out.storageFileId).toBeNull();
  });
});
