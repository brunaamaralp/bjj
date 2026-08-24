import { describe, it, expect, vi } from 'vitest';
import {
  buildWeeklyScheduleGrid,
  SCHEDULE_WEEKDAY_LABELS,
} from '../lib/schedules.js';
import {
  classifyScheduleTimeStatus,
  capacityTone,
  computeHorizontalCenterScrollDelta,
  flattenTodaySchedules,
  formatOccupancyLabel,
  readModalityFilter,
  resolveScheduleCardContext,
  resolveScheduleCardStyle,
  resolveScheduleGridColumns,
  scheduleTimeStatusLabel,
  scrollChildHorizontallyIntoContainer,
  slotByScheduleIdForDate,
  writeModalityFilter,
} from '../lib/recepcaoScheduleGrid.js';

describe('recepcaoScheduleGrid', () => {
  const sampleSchedules = [
    {
      id: 'a',
      is_active: true,
      name: 'Manhã',
      time_start: '07:00',
      time_end: '08:00',
      days_of_week: ['mon'],
      modality: 'bjj',
      class_id: 'c1',
    },
    {
      id: 'b',
      is_active: true,
      name: 'Domingo',
      time_start: '10:00',
      time_end: '11:00',
      days_of_week: ['sun'],
      modality: 'kids',
      class_id: 'c2',
    },
  ];

  it('resolveScheduleGridColumns omits sunday when no sunday classes', () => {
    const cols = resolveScheduleGridColumns([sampleSchedules[0]]);
    expect(cols.map((c) => c.id)).not.toContain('sun');
  });

  it('resolveScheduleGridColumns includes sunday when scheduled', () => {
    const cols = resolveScheduleGridColumns(sampleSchedules);
    expect(cols.map((c) => c.id)).toContain('sun');
  });

  it('flattenTodaySchedules returns items for today column', () => {
    const columns = [{ id: 'mon', label: SCHEDULE_WEEKDAY_LABELS.mon }];
    const grid = buildWeeklyScheduleGrid([sampleSchedules[0]], { columns });
    const items = flattenTodaySchedules(grid, 'mon');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('a');
  });

  it('resolveScheduleCardStyle uses class color when valid hex', () => {
    const style = resolveScheduleCardStyle({ color: '#6C47D8' });
    expect(style.borderColor).toBe('#6C47D8');
  });

  it('resolveScheduleCardStyle falls back to primary token', () => {
    const style = resolveScheduleCardStyle({ color: 'invalid' });
    expect(style.borderColor).toBe('var(--color-primary)');
  });

  it('classifyScheduleTimeStatus detects ongoing', () => {
    const now = new Date(2026, 6, 1, 19, 15, 0);
    expect(classifyScheduleTimeStatus('19:00', '20:00', now)).toBe('ongoing');
  });

  it('classifyScheduleTimeStatus detects soon', () => {
    const now = new Date(2026, 6, 1, 18, 30, 0);
    expect(classifyScheduleTimeStatus('19:00', '20:00', now)).toBe('soon');
  });

  it('classifyScheduleTimeStatus detects past', () => {
    const now = new Date(2026, 6, 1, 21, 0, 0);
    expect(classifyScheduleTimeStatus('19:00', '20:00', now)).toBe('past');
  });

  it('slotByScheduleIdForDate maps by schedule_id for date', () => {
    const map = slotByScheduleIdForDate(
      [
        { id: 's1', schedule_id: 'sch1', slot_date: '2026-07-01', booked_count: 2 },
        { id: 's2', schedule_id: 'sch2', slot_date: '2026-07-02', booked_count: 1 },
      ],
      '2026-07-01'
    );
    expect(map.get('sch1')?.id).toBe('s1');
    expect(map.has('sch2')).toBe(false);
  });

  it('capacityTone returns full, warn and ok', () => {
    expect(capacityTone(20, 20)).toBe('full');
    expect(capacityTone(17, 20)).toBe('warn');
    expect(capacityTone(5, 20)).toBe('ok');
    expect(capacityTone(5, null)).toBe(null);
  });

  it('scheduleTimeStatusLabel returns labels for ongoing and soon', () => {
    expect(scheduleTimeStatusLabel('ongoing')).toBe('Em andamento');
    expect(scheduleTimeStatusLabel('soon')).toBe('Em breve');
    expect(scheduleTimeStatusLabel('past')).toBe(null);
  });

  it('resolveScheduleCardContext merges slot occupancy on today', () => {
    const map = new Map([
      ['sch1', { schedule_id: 'sch1', booked_count: 8, max_capacity: 20 }],
    ]);
    const ctx = resolveScheduleCardContext(
      { id: 'sch1', time_start: '19:00', time_end: '20:00' },
      { isToday: true, slotByScheduleId: map, nowDate: new Date(2026, 6, 1, 19, 10, 0) }
    );
    expect(ctx.timeStatus).toBe('ongoing');
    expect(ctx.occupancy).toEqual({ booked: 8, max: 20 });
  });

  it('formatOccupancyLabel formats booked and max', () => {
    expect(formatOccupancyLabel({ booked: 3, max: 20 })).toBe('3 / 20');
    expect(formatOccupancyLabel({ booked: 1, max: null })).toBe('1 inscrito');
  });

  it('readModalityFilter and writeModalityFilter round-trip', () => {
    writeModalityFilter('bjj');
    expect(readModalityFilter()).toBe('bjj');
    writeModalityFilter('');
    expect(readModalityFilter()).toBe('');
  });

  it('computeHorizontalCenterScrollDelta centers child inside overflow container only', () => {
    // Container [0, 400] center 200; child [300, 400] center 350 → delta +150
    expect(
      computeHorizontalCenterScrollDelta({
        containerLeft: 0,
        containerWidth: 400,
        childLeft: 300,
        childWidth: 100,
      })
    ).toBe(150);

    // Already centered → no horizontal move
    expect(
      computeHorizontalCenterScrollDelta({
        containerLeft: 0,
        containerWidth: 400,
        childLeft: 150,
        childWidth: 100,
      })
    ).toBe(0);

    // Invalid geometry → 0 (do not scroll page as fallback)
    expect(
      computeHorizontalCenterScrollDelta({
        containerLeft: 0,
        containerWidth: 0,
        childLeft: 100,
        childWidth: 50,
      })
    ).toBe(0);
  });

  it('scrollChildHorizontallyIntoContainer uses scrollBy on the wrap, not scrollIntoView', () => {
    const scrollBy = vi.fn();
    const scrollIntoView = vi.fn();
    const container = {
      scrollBy,
      getBoundingClientRect: () => ({ left: 0, width: 400, top: 0, height: 200 }),
    };
    const child = {
      scrollIntoView,
      getBoundingClientRect: () => ({ left: 300, width: 100, top: 80, height: 40 }),
    };

    expect(scrollChildHorizontallyIntoContainer(container, child)).toBe(true);
    expect(scrollBy).toHaveBeenCalledWith({ left: 150, behavior: 'smooth' });
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('buildWeeklyScheduleGrid custom columns', () => {
  it('only renders passed weekday columns', () => {
    const grid = buildWeeklyScheduleGrid(
      [
        {
          id: 'a',
          is_active: true,
          name: 'Seg',
          time_start: '07:00',
          time_end: '08:00',
          days_of_week: ['mon', 'wed'],
        },
      ],
      { columns: [{ id: 'mon', label: 'Seg' }] }
    );
    expect(grid.columns).toHaveLength(1);
    expect(grid.rows[0].cells.mon).toHaveLength(1);
    expect(grid.rows[0].cells.wed).toBeUndefined();
  });
});
