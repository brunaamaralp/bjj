import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { Query } from 'node-appwrite';

const sendAutomationTemplateCron = vi.fn();
const hasFollowupContactSinceClass = vi.fn();

vi.mock('../../lib/server/sendAutomationCron.js', () => ({
  sendAutomationTemplateCron: (...args) => sendAutomationTemplateCron(...args),
}));

vi.mock('../../lib/server/followupContactServer.js', () => ({
  hasFollowupContactSinceClass: (...args) => hasFollowupContactSinceClass(...args),
}));

let runAutomations;
let AUTOMATIONS_CRON_PAGE_SIZE;

beforeAll(async () => {
  vi.stubEnv('VITE_APPWRITE_LEADS_COLLECTION_ID', 'leads-col');
  vi.stubEnv('VITE_APPWRITE_ACADEMIES_COLLECTION_ID', 'academies-col');
  vi.resetModules();
  const mod = await import('../../lib/server/runAutomationsCron.js');
  runAutomations = mod.runAutomations;
  AUTOMATIONS_CRON_PAGE_SIZE = mod.AUTOMATIONS_CRON_PAGE_SIZE;
});

const NOW = new Date('2026-06-15T17:00:00.000Z');
const FUTURE_SEND = '2026-06-15T20:00:00.000Z';

function leadDoc(overrides = {}) {
  return {
    $id: 'lead-1',
    academyId: 'acad-1',
    phone: '5511999999999',
    scheduledDate: '2026-06-14',
    pending_automations: JSON.stringify([
      { key: 'schedule_reminder', sendAt: FUTURE_SEND, sent: false },
    ]),
    ...overrides,
  };
}

function makeLeadBatch(count, idPrefix = 'lead') {
  return Array.from({ length: count }, (_, i) =>
    leadDoc({
      $id: `${idPrefix}-${String(i + 1).padStart(4, '0')}`,
    })
  );
}

function academyDoc() {
  return {
    $id: 'acad-1',
    automations_config: JSON.stringify({
      schedule_reminder: { active: true, templateKey: 'reminder', delayMinutes: 120 },
      followup_d1_attended: { active: true, templateKey: 'dashboard_contact', delayMinutes: 0 },
      waiting_decision: { active: true, templateKey: 'recovery', delayMinutes: 1440 },
    }),
    zapster_instance_id: 'inst-1',
  };
}

function mockDatabases({ documents = [], updateDocument = vi.fn().mockResolvedValue({}) } = {}) {
  const getDocument = vi.fn().mockResolvedValue(academyDoc());
  const listDocuments = vi.fn().mockResolvedValue({ documents });
  return {
    databases: { listDocuments, getDocument, updateDocument },
    listDocuments,
    getDocument,
    updateDocument,
  };
}

function mockPaginatedDatabases(pages) {
  let callIndex = 0;
  const getDocument = vi.fn().mockResolvedValue(academyDoc());
  const updateDocument = vi.fn().mockResolvedValue({});
  const listDocuments = vi.fn().mockImplementation(() => {
    const documents = pages[callIndex] ?? [];
    callIndex += 1;
    return Promise.resolve({ documents });
  });
  return {
    databases: { listDocuments, getDocument, updateDocument },
    listDocuments,
    getDocument,
    updateDocument,
  };
}

function expectBaseQueries(queries) {
  expect(queries[0]).toEqual(Query.equal('has_pending_automations', [true]));
  expect(queries[1]).toEqual(Query.limit(AUTOMATIONS_CRON_PAGE_SIZE));
  expect(queries[2]).toEqual(Query.orderAsc('$id'));
}

describe('runAutomations — timing da fila pending_automations', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sendAutomationTemplateCron.mockReset();
    sendAutomationTemplateCron.mockResolvedValue({ ok: true });
    hasFollowupContactSinceClass.mockReset();
    hasFollowupContactSinceClass.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('processa lead com sendAt <= now', async () => {
    const sendAt = '2026-06-15T16:55:00.000Z';
    const { databases, updateDocument } = mockDatabases({
      documents: [
        leadDoc({
          pending_automations: JSON.stringify([
            { key: 'schedule_reminder', sendAt, sent: false },
          ]),
        }),
      ],
    });

    const out = await runAutomations(databases);

    expect(out.sent).toBe(1);
    expect(out.due).toBe(1);
    expect(out.hasMore).toBe(false);
    expect(sendAutomationTemplateCron).toHaveBeenCalledTimes(1);
    expect(sendAutomationTemplateCron.mock.calls[0][0].automationKey).toBe('schedule_reminder');
    expect(updateDocument).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(updateDocument.mock.calls[0][3].pending_automations);
    expect(saved[0].sent).toBe(true);
    expect(updateDocument.mock.calls[0][3].has_pending_automations).toBe(false);
  });

  it('não processa lead com sendAt > now', async () => {
    const sendAt = '2026-06-15T17:05:00.000Z';
    const { databases, updateDocument } = mockDatabases({
      documents: [
        leadDoc({
          pending_automations: JSON.stringify([
            { key: 'schedule_reminder', sendAt, sent: false },
          ]),
        }),
      ],
    });

    const out = await runAutomations(databases);

    expect(out.sent).toBe(0);
    expect(out.due).toBe(0);
    expect(sendAutomationTemplateCron).not.toHaveBeenCalled();
    expect(updateDocument).not.toHaveBeenCalled();
  });

  it('não processa lead sem has_pending_automations', async () => {
    const { databases, listDocuments } = mockDatabases({ documents: [] });

    const out = await runAutomations(databases);

    expect(out.scanned).toBe(0);
    expect(out.hasMore).toBe(false);
    expect(listDocuments).toHaveBeenCalledTimes(1);
    expectBaseQueries(listDocuments.mock.calls[0][2]);
  });

  it('processa múltiplos tipos na mesma execução', async () => {
    const past = '2026-06-15T16:00:00.000Z';
    const { databases, updateDocument } = mockDatabases({
      documents: [
        leadDoc({
          pending_automations: JSON.stringify([
            { key: 'schedule_reminder', sendAt: past, sent: false },
            { key: 'followup_d1_attended', sendAt: past, sent: false },
          ]),
        }),
      ],
    });

    const out = await runAutomations(databases);

    expect(out.sent).toBe(2);
    expect(sendAutomationTemplateCron).toHaveBeenCalledTimes(2);
    const keys = sendAutomationTemplateCron.mock.calls.map((c) => c[0].automationKey).sort();
    expect(keys).toEqual(['followup_d1_attended', 'schedule_reminder']);
    const saved = JSON.parse(updateDocument.mock.calls[0][3].pending_automations);
    expect(saved.every((p) => p.sent === true)).toBe(true);
  });
});

describe('runAutomations — paginação e backlog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    sendAutomationTemplateCron.mockReset();
    sendAutomationTemplateCron.mockResolvedValue({ ok: true });
    hasFollowupContactSinceClass.mockReset();
    hasFollowupContactSinceClass.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('pagina além de 100 leads se tempo permitir', async () => {
    const page1 = makeLeadBatch(100, 'p1');
    const page2 = makeLeadBatch(50, 'p2');
    const { databases, listDocuments } = mockPaginatedDatabases([page1, page2]);

    const out = await runAutomations(databases, { maxMs: 60_000 });

    expect(out.scanned).toBeGreaterThanOrEqual(101);
    expect(out.scanned).toBe(150);
    expect(listDocuments).toHaveBeenCalledTimes(2);
    expectBaseQueries(listDocuments.mock.calls[0][2]);
    expect(listDocuments.mock.calls[1][2].some((q) => String(q).includes('cursorAfter'))).toBe(true);
    expect(out.hasMore).toBe(false);
  });

  it('para paginação quando timeout se aproxima', async () => {
    const manyLeads = makeLeadBatch(100, 'slow');
    const { databases, listDocuments } = mockPaginatedDatabases([manyLeads]);

    let nowMs = NOW.getTime();
    vi.spyOn(Date, 'now').mockImplementation(() => {
      nowMs += 50;
      return nowMs;
    });

    const out = await runAutomations(databases, { maxMs: 500, maxPages: 10 });

    expect(out.scanned).toBeLessThan(100);
    expect(out.hasMore).toBe(true);
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });

  it('retorna hasMore: true quando há leads não processados', async () => {
    const page1 = makeLeadBatch(100, 'full');
    const { databases, listDocuments } = mockPaginatedDatabases([page1, makeLeadBatch(1, 'extra')]);

    const out = await runAutomations(databases, { maxMs: 60_000, maxPages: 1 });

    expect(out.scanned).toBe(100);
    expect(out.hasMore).toBe(true);
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });

  it('retorna hasMore: false quando fila foi esgotada', async () => {
    const page = makeLeadBatch(50, 'done');
    const { databases, listDocuments } = mockPaginatedDatabases([page]);

    const out = await runAutomations(databases, { maxMs: 60_000 });

    expect(out.scanned).toBe(50);
    expect(out.hasMore).toBe(false);
    expect(listDocuments).toHaveBeenCalledTimes(1);
  });
});
