import { describe, it, expect } from 'vitest';
import {
  countActiveBookings,
  hasCapacityForBooking,
  isWithinCheckinWindow,
  parseBookingSettings,
  resolveMaxCapacity,
  buildClassSlotDocument,
  BOOKING_STATUS_BOOKED,
  BOOKING_STATUS_CANCELLED,
  BOOKING_STATUS_CHECKED_IN,
} from '../../lib/bookingCore.js';
import { localDateTimeToUtcIso, weekdayCodeInTz, addDaysYmd } from '../../lib/bookingDateTime.js';
import { planSlotsForSchedules } from '../../lib/server/classSlotGenerator.js';

describe('bookingCore', () => {
  it('resolveMaxCapacity cascades schedule then class', () => {
    expect(resolveMaxCapacity({ max_capacity: 15 }, { max_capacity: 20 })).toBe(15);
    expect(resolveMaxCapacity({ max_capacity: null }, { max_capacity: 20 })).toBe(20);
    expect(resolveMaxCapacity({}, {})).toBe(null);
  });

  it('countActiveBookings counts only booked status', () => {
    const n = countActiveBookings([
      { status: BOOKING_STATUS_BOOKED },
      { status: BOOKING_STATUS_CHECKED_IN },
      { status: BOOKING_STATUS_CANCELLED },
    ]);
    expect(n).toBe(1);
  });

  it('hasCapacityForBooking respects max', () => {
    expect(hasCapacityForBooking(2, 1)).toBe(true);
    expect(hasCapacityForBooking(2, 2)).toBe(false);
    expect(hasCapacityForBooking(null, 99)).toBe(true);
  });

  it('parseBookingSettings applies defaults', () => {
    const s = parseBookingSettings({ booking: { timezone: 'America/Sao_Paulo' } });
    expect(s.timezone).toBe('America/Sao_Paulo');
    expect(s.slot_horizon_days).toBe(14);
    expect(s.checkin_window_before_min).toBe(30);
  });

  it('isWithinCheckinWindow uses before/after minutes', () => {
    const starts = '2026-06-19T21:00:00.000Z';
    expect(isWithinCheckinWindow('2026-06-19T20:35:00.000Z', starts, {})).toBe(true);
    expect(isWithinCheckinWindow('2026-06-19T21:10:00.000Z', starts, {})).toBe(true);
    expect(isWithinCheckinWindow('2026-06-19T19:00:00.000Z', starts, {})).toBe(false);
  });

  it('buildClassSlotDocument builds UTC instants', () => {
    const doc = buildClassSlotDocument({
      academyId: 'acad-1',
      schedule: {
        id: 'sch-1',
        class_id: 'class-1',
        weekday: 'thu',
        time_start: '19:00',
        time_end: '20:30',
        name: 'Adulto',
        modality: 'bjj',
      },
      classDoc: { id: 'class-1', name: 'Adulto', modality: 'bjj', max_capacity: 25 },
      slotDate: '2026-06-19',
      timeZone: 'America/Sao_Paulo',
    });
    expect(doc.slot_date).toBe('2026-06-19');
    expect(doc.weekday).toBe('thu');
    expect(doc.max_capacity).toBe(25);
    expect(doc.starts_at).toMatch(/T/);
  });
});

describe('bookingDateTime', () => {
  it('weekdayCodeInTz returns mon..sun', () => {
    // 2026-06-19 is Friday in São Paulo
    expect(weekdayCodeInTz('2026-06-19', 'America/Sao_Paulo')).toBe('fri');
  });

  it('addDaysYmd advances calendar', () => {
    expect(addDaysYmd('2026-06-19', 1, 'America/Sao_Paulo')).toBe('2026-06-20');
  });

  it('localDateTimeToUtcIso converts SP evening', () => {
    const iso = localDateTimeToUtcIso('2026-06-19', '19:00', 'America/Sao_Paulo');
    expect(new Date(iso).toISOString()).toBe(iso);
  });
});

describe('classSlotGenerator plan', () => {
  it('plans slots only on matching weekdays', () => {
    const schedules = [
      {
        id: 's1',
        class_id: 'c1',
        is_active: true,
        days_of_week: ['mon', 'wed'],
        time_start: '18:00',
        time_end: '19:00',
        name: 'Noite',
        modality: 'bjj',
      },
    ];
    const classesMap = new Map([
      ['c1', { id: 'c1', name: 'Adulto', modality: 'bjj', is_active: true, max_capacity: 10 }],
    ]);
    const planned = planSlotsForSchedules(
      schedules,
      classesMap,
      ['2026-06-15', '2026-06-16', '2026-06-17'],
      'acad-1',
      'America/Sao_Paulo'
    );
    expect(planned).toHaveLength(2);
    expect(planned.map((p) => p.slot_date).sort()).toEqual(['2026-06-15', '2026-06-17']);
  });
});
