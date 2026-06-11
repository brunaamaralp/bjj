import { describe, expect, it } from 'vitest';
import { buildFollowupEventMapsFromDocs } from '../lib/followupEventsMaps.js';

describe('buildFollowupEventMapsFromDocs', () => {
  it('agrega done, contact e snooze por lead', () => {
    const maps = buildFollowupEventMapsFromDocs([
      { lead_id: 'a', type: 'followup_done', at: '2026-06-01T10:00:00.000Z' },
      { lead_id: 'a', type: 'followup_contact', at: '2026-06-02T10:00:00.000Z' },
      {
        lead_id: 'b',
        type: 'followup_snooze',
        at: '2026-06-03T10:00:00.000Z',
        payload_json: JSON.stringify({ untilYmd: '2026-06-15' }),
      },
      {
        lead_id: 'c',
        type: 'whatsapp_template_sent',
        at: '2026-06-04T10:00:00.000Z',
        payload_json: JSON.stringify({ automationKey: 'missed' }),
      },
    ]);
    expect(maps.doneByLead).toEqual({ a: '2026-06-01T10:00:00.000Z' });
    expect(maps.contactByLead).toEqual({
      a: '2026-06-02T10:00:00.000Z',
      c: '2026-06-04T10:00:00.000Z',
    });
    expect(maps.snoozeUntilByLead).toEqual({ b: '2026-06-15' });
  });

  it('mantém o primeiro evento por lead (ordem desc na query)', () => {
    const maps = buildFollowupEventMapsFromDocs([
      { lead_id: 'x', type: 'followup_done', at: '2026-06-10T00:00:00.000Z' },
      { lead_id: 'x', type: 'followup_done', at: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(maps.doneByLead.x).toBe('2026-06-10T00:00:00.000Z');
  });
});
