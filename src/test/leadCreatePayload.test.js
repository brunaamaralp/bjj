import { describe, it, expect } from 'vitest';
import {
  buildLeadCreateDocumentPayload,
  extractInitialNoteEvents,
  LEAD_CREATE_FORBIDDEN_KEYS,
} from '../lib/leadCreatePayload.js';

describe('leadCreatePayload', () => {
  it('não inclui notes nem contact_type no payload de createDocument', () => {
    const payload = buildLeadCreateDocumentPayload(
      {
        name: 'Ana',
        phone: '37999999999',
        notes: [{ type: 'note', text: 'Obs teste' }],
        contact_type: 'lead',
        initialNote: 'Obs teste',
      },
      { academyId: 'acad-1' }
    );
    for (const key of LEAD_CREATE_FORBIDDEN_KEYS) {
      expect(payload).not.toHaveProperty(key);
    }
    expect(payload).toMatchObject({
      name: 'Ana',
      phone: '37999999999',
      academyId: 'acad-1',
    });
  });

  it('extractInitialNoteEvents prioriza initialNote sobre notes legado', () => {
    const events = extractInitialNoteEvents({
      initialNote: ' Primeira obs ',
      notes: [{ type: 'note', text: 'legado' }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe('Primeira obs');
  });

  it('extractInitialNoteEvents aceita array notes legado', () => {
    const events = extractInitialNoteEvents({
      notes: [{ type: 'note', text: 'via array' }],
    });
    expect(events).toHaveLength(1);
    expect(events[0].text).toBe('via array');
  });
});
