import { describe, it, expect } from 'vitest';
import { filterLeadsInCivilWeek, getWeekStart } from '../components/AgendaCalendarWeek.jsx';

describe('AgendaCalendarWeek helpers', () => {
  it('getWeekStart retorna segunda-feira', () => {
    const mon = getWeekStart(0);
    expect(mon.getDay()).toBe(1);
  });

  it('filterLeadsInCivilWeek inclui lead na semana civil', () => {
    const mon = getWeekStart(0);
    const y = mon.getFullYear();
    const m = String(mon.getMonth() + 1).padStart(2, '0');
    const d = String(mon.getDate()).padStart(2, '0');
    const leads = [{ id: '1', scheduledDate: `${y}-${m}-${d}` }];
    expect(filterLeadsInCivilWeek(leads, 0)).toHaveLength(1);
  });
});
