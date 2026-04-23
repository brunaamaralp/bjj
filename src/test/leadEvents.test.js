import { describe, it, expect, vi, beforeEach } from 'vitest';

const leadEventsMocks = vi.hoisted(() => ({
  createDocument: vi.fn().mockResolvedValue({ $id: 'mock-id' }),
  listDocuments: vi.fn().mockResolvedValue({ documents: [], total: 0 })
}));

vi.mock('appwrite', () => ({
  ID: { unique: vi.fn(() => 'mock-unique-id') },
  Query: {
    equal: (k, v) => ({ op: 'eq', k, v }),
    orderDesc: (k) => ({ op: 'desc', k }),
    limit: (n) => ({ op: 'limit', n })
  },
  Permission: {
    read: (r) => ({ read: r }),
    update: (r) => ({ update: r }),
    delete: (r) => ({ delete: r })
  },
  Role: {
    user: (id) => `user:${id}`,
    team: (id) => `team:${id}`,
    users: () => 'users'
  }
}));

vi.mock('../lib/appwrite.js', () => ({
  databases: {
    createDocument: leadEventsMocks.createDocument,
    listDocuments: leadEventsMocks.listDocuments
  },
  DB_ID: 'test-db',
  LEAD_EVENTS_COL: 'test-events'
}));

import { ID } from 'appwrite';
import { addLeadEvent, getLeadEvents } from '../lib/leadEvents.js';
import { LEAD_TIMELINE_CHANGED } from '../lib/leadTimelineEvents.js';
import { mapAppwriteDocToLead } from '../lib/mapAppwriteLeadDoc.js';
import { LEAD_STATUS } from '../lib/leadStatus.js';

describe('addLeadEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  const createDocument = () => leadEventsMocks.createDocument;

  it('cria documento com campos corretos', async () => {
    await addLeadEvent({
      academyId: 'acad-1',
      leadId: 'lead-1',
      type: 'note',
      from: 'a',
      to: 'b',
      text: 'hello',
      at: '2026-01-15T12:00:00.000Z',
      createdBy: 'user-99',
      payloadJson: null,
      permissionContext: { ownerId: 'o1', teamId: '', userId: '' }
    });
    expect(createDocument()).toHaveBeenCalledTimes(1);
    const [, col, docId, payload] = createDocument().mock.calls[0];
    expect(col).toBe('test-events');
    expect(docId).toBe('mock-unique-id');
    expect(payload.academy_id).toBe('acad-1');
    expect(payload.lead_id).toBe('lead-1');
    expect(payload.type).toBe('note');
    expect(payload.from).toBe('a');
    expect(payload.to).toBe('b');
    expect(payload.text).toBe('hello');
    expect(payload.at).toBe('2026-01-15T12:00:00.000Z');
    expect(payload.created_by).toBe('user-99');
    expect(payload.payload_json).toBe('');
  });

  it('emite timeline changed após criar documento', async () => {
    const dispatch = vi.fn();
    vi.stubGlobal('window', { dispatchEvent: dispatch });
    await addLeadEvent({
      academyId: 'acad-1',
      leadId: 'lead-zz',
      type: 'note',
      text: 'hello',
      permissionContext: {}
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    const [evt] = dispatch.mock.calls[0];
    expect(evt.type).toBe(LEAD_TIMELINE_CHANGED);
    expect(evt.detail.leadId).toBe('lead-zz');
    expect(evt.detail.eventType).toBe('note');
  });

  it('usa ID.unique() como document ID', async () => {
    await addLeadEvent({
      academyId: 'a',
      leadId: 'l',
      type: 'schedule',
      permissionContext: { userId: 'u' }
    });
    expect(ID.unique).toHaveBeenCalled();
    expect(createDocument().mock.calls[0][2]).toBe('mock-unique-id');
  });

  it('serializa payloadJson quando fornecido', async () => {
    await addLeadEvent({
      academyId: 'a',
      leadId: 'l',
      type: 'import',
      payloadJson: { source: 'Planilha' },
      permissionContext: {}
    });
    const payload = createDocument().mock.calls[0][3];
    expect(JSON.parse(payload.payload_json)).toEqual({ source: 'Planilha' });
  });

  it('usa new Date() quando at não fornecido', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T10:00:00.000Z'));
    try {
      await addLeadEvent({
        academyId: 'a',
        leadId: 'l',
        type: 'note',
        permissionContext: {}
      });
      const payload = createDocument().mock.calls[0][3];
      expect(payload.at).toBe('2026-06-01T10:00:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });

  it('não falha quando payloadJson é null', async () => {
    await addLeadEvent({
      academyId: 'a',
      leadId: 'l',
      type: 'note',
      payloadJson: null,
      permissionContext: {}
    });
    expect(createDocument().mock.calls[0][3].payload_json).toBe('');
  });
});

describe('getLeadEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const listDocuments = () => leadEventsMocks.listDocuments;

  it('filtra por lead_id e academy_id', async () => {
    await getLeadEvents('lead-x', 'acad-y');
    expect(listDocuments()).toHaveBeenCalledWith(
      'test-db',
      'test-events',
      expect.arrayContaining([
        expect.objectContaining({ op: 'eq', k: 'lead_id', v: 'lead-x' }),
        expect.objectContaining({ op: 'eq', k: 'academy_id', v: 'acad-y' })
      ])
    );
  });

  it('ordena por at decrescente', async () => {
    await getLeadEvents('l', 'a');
    const q = listDocuments().mock.calls[0][2];
    expect(q.some((x) => x?.op === 'desc' && x.k === 'at')).toBe(true);
  });

  it('retorna array vazio quando não há eventos', async () => {
    listDocuments().mockResolvedValueOnce({ documents: [], total: 0 });
    const res = await getLeadEvents('l', 'a');
    expect(res.documents).toEqual([]);
    expect(res.total).toBe(0);
  });
});

describe('mapAppwriteDocToLead', () => {
  const op = new Set(Object.values(LEAD_STATUS));

  it('mapeia attended_at do documento', () => {
    const lead = mapAppwriteDocToLead(
      { $id: '1', name: 'N', phone: '1', status: LEAD_STATUS.NEW, attended_at: '2026-01-01T00:00:00.000Z' },
      op
    );
    expect(lead.attendedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('mapeia missed_at do documento', () => {
    const lead = mapAppwriteDocToLead(
      { $id: '1', name: 'N', phone: '1', status: LEAD_STATUS.NEW, missed_at: '2026-02-01T00:00:00.000Z' },
      op
    );
    expect(lead.missedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('mapeia converted_at do documento', () => {
    const lead = mapAppwriteDocToLead(
      { $id: '1', name: 'N', phone: '1', status: LEAD_STATUS.CONVERTED, converted_at: '2026-03-01T00:00:00.000Z' },
      op
    );
    expect(lead.convertedAt).toBe('2026-03-01T00:00:00.000Z');
  });

  it('mapeia whatsapp_intention do documento', () => {
    const lead = mapAppwriteDocToLead(
      { $id: '1', name: 'N', phone: '1', status: LEAD_STATUS.NEW, whatsapp_intention: 'matricula' },
      op
    );
    expect(lead.intention).toBe('matricula');
  });

  it('parseia custom_answers_json corretamente', () => {
    const lead = mapAppwriteDocToLead(
      {
        $id: '1',
        name: 'N',
        phone: '1',
        status: LEAD_STATUS.NEW,
        custom_answers_json: '{"q1":"a"}'
      },
      op
    );
    expect(lead.customAnswers).toEqual({ q1: 'a' });
  });

  it('retorna {} para custom_answers_json inválido', () => {
    const lead = mapAppwriteDocToLead(
      {
        $id: '1',
        name: 'N',
        phone: '1',
        status: LEAD_STATUS.NEW,
        custom_answers_json: 'not-json'
      },
      op
    );
    expect(lead.customAnswers).toEqual({});
  });

  it('não quebra com documento sem campos novos (null)', () => {
    const lead = mapAppwriteDocToLead(
      {
        $id: '1',
        name: 'N',
        phone: '1',
        status: LEAD_STATUS.NEW
      },
      op
    );
    expect(lead.attendedAt).toBeNull();
    expect(lead.missedAt).toBeNull();
    expect(lead.convertedAt).toBeNull();
    expect(lead.intention).toBe('');
  });
});
