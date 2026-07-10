import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Query } from 'node-appwrite';

const mocks = vi.hoisted(() => ({
  backfillMessagesRecentFromFull: vi.fn(),
}));

vi.mock('../../lib/server/conversationsStore.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    backfillMessagesRecentFromFull: (...args) => mocks.backfillMessagesRecentFromFull(...args),
  };
});

describe('messagesRecentBackfillCron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('APPWRITE_CONVERSATIONS_COLLECTION_ID', 'conversations-col');
    mocks.backfillMessagesRecentFromFull.mockResolvedValue({ ok: true });
  });

  it('buildMessagesRecentBackfillQueries filtra messages_recent ausente ou vazio', async () => {
    const { buildMessagesRecentBackfillQueries } = await import(
      '../../lib/server/runMessagesRecentBackfillCron.js'
    );
    const queries = buildMessagesRecentBackfillQueries('acad-1', 'cursor-doc');
    expect(queries[0]).toEqual(Query.equal('academy_id', ['acad-1']));
    expect(queries).toContainEqual(Query.cursorAfter('cursor-doc'));
    expect(queries.some((q) => String(q).includes('or') || String(q).includes('messages_recent'))).toBe(true);
  });

  it('backfill conversas legadas com messages preenchido', async () => {
    const listDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        documents: [
          {
            $id: 'conv-1',
            academy_id: 'acad-1',
            messages_recent: '[]',
            updated_at: '2026-06-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'conv-1', messages: JSON.stringify([{ role: 'user', content: 'Oi' }]) }],
      });

    const { runMessagesRecentBackfillCron } = await import(
      '../../lib/server/runMessagesRecentBackfillCron.js'
    );
    const out = await runMessagesRecentBackfillCron({ listDocuments }, 'db-main', {
      academyId: 'acad-1',
    });

    expect(out.ok).toBe(true);
    expect(out.backfilled).toBe(1);
    expect(mocks.backfillMessagesRecentFromFull).toHaveBeenCalledWith(
      'conv-1',
      JSON.stringify([{ role: 'user', content: 'Oi' }])
    );
  });

  it('ignora conversas sem messages', async () => {
    const listDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        documents: [{ $id: 'conv-empty', academy_id: 'acad-1', messages_recent: '' }],
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'conv-empty', messages: '[]' }],
      });

    const { runMessagesRecentBackfillCron } = await import(
      '../../lib/server/runMessagesRecentBackfillCron.js'
    );
    const out = await runMessagesRecentBackfillCron({ listDocuments }, 'db-main');

    expect(out.skippedEmpty).toBe(1);
    expect(out.backfilled).toBe(0);
    expect(mocks.backfillMessagesRecentFromFull).not.toHaveBeenCalled();
  });

  it('dryRun não grava backfill', async () => {
    const listDocuments = vi
      .fn()
      .mockResolvedValueOnce({
        documents: [{ $id: 'conv-2', academy_id: 'acad-1', messages_recent: null }],
      })
      .mockResolvedValueOnce({
        documents: [{ $id: 'conv-2', messages: JSON.stringify([{ role: 'user', content: 'x' }]) }],
      });

    const { runMessagesRecentBackfillCron } = await import(
      '../../lib/server/runMessagesRecentBackfillCron.js'
    );
    const out = await runMessagesRecentBackfillCron({ listDocuments }, 'db-main', { dryRun: true });

    expect(out.backfilled).toBe(1);
    expect(mocks.backfillMessagesRecentFromFull).not.toHaveBeenCalled();
  });
});
