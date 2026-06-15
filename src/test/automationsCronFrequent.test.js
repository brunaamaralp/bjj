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

beforeAll(async () => {
  vi.stubEnv('VITE_APPWRITE_LEADS_COLLECTION_ID', 'leads-col');
  vi.stubEnv('VITE_APPWRITE_ACADEMIES_COLLECTION_ID', 'academies-col');
  vi.resetModules();
  const mod = await import('../../lib/server/runAutomationsCron.js');
  runAutomations = mod.runAutomations;
});

const NOW = new Date('2026-06-15T17:00:00.000Z');

function leadDoc(overrides = {}) {
  return {
    $id: 'lead-1',
    academyId: 'acad-1',
    phone: '5511999999999',
    scheduledDate: '2026-06-14',
    pending_automations: JSON.stringify([]),
    ...overrides,
  };
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
    expect(sendAutomationTemplateCron).toHaveBeenCalledTimes(1);
    expect(sendAutomationTemplateCron.mock.calls[0][0].automationKey).toBe('schedule_reminder');
    expect(updateDocument).toHaveBeenCalledTimes(1);
    const saved = JSON.parse(updateDocument.mock.calls[0][3].pending_automations);
    expect(saved[0].sent).toBe(true);
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
    expect(listDocuments).toHaveBeenCalledWith(
      expect.any(String),
      'leads-col',
      [Query.equal('has_pending_automations', [true]), Query.limit(100)]
    );
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
