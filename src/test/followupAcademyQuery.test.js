import { describe, it, expect } from 'vitest';
import { LEAD_STATUS } from '../lib/leadStatus.js';
import {
  queryCoolingFollowupsRows,
  queryAttendedNotContactedYesterdayRows,
} from '../../lib/server/followupAcademyQuery.js';

describe('followupAcademyQuery', () => {
  it('queryCoolingFollowupsRows lists cooling and critical leads', () => {
    const rows = queryCoolingFollowupsRows([
      {
        id: 'l1',
        name: 'Ana',
        phone: '11999990000',
        temperature: 'cooling',
        daysAgo: 2,
        doneForCurrentClass: false,
        isSnoozed: false,
        nextActionLabel: 'WhatsApp',
      },
      {
        id: 'l2',
        name: 'Bob',
        temperature: 'on_track',
        daysAgo: 0,
        doneForCurrentClass: false,
        isSnoozed: false,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('l1');
    expect(rows[0].line).toMatch(/esfriando/i);
  });

  it('queryAttendedNotContactedYesterdayRows filters D+1 without contact', () => {
    const now = new Date('2026-06-11T12:00:00');
    const rows = queryAttendedNotContactedYesterdayRows(
      [
        {
          id: 'l1',
          name: 'Carla',
          status: LEAD_STATUS.COMPLETED,
          scheduledDate: '2026-06-10',
          hasContactInCycle: false,
          doneForCurrentClass: false,
        },
        {
          id: 'l2',
          name: 'Diego',
          status: LEAD_STATUS.COMPLETED,
          scheduledDate: '2026-06-09',
          hasContactInCycle: false,
          doneForCurrentClass: false,
        },
      ],
      now
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('l1');
    expect(rows[0].line).toMatch(/sem retorno/i);
  });
});
