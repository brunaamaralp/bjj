import { describe, it, expect } from 'vitest';
import {
  saleAcademyIds,
  saleBelongsToAcademy,
  filterSalesForAcademy,
} from '../../lib/server/saleAcademyScope.js';

describe('saleAcademyScope', () => {
  it('saleAcademyIds collects camelCase and snake_case', () => {
    expect(saleAcademyIds({ academyId: 'a1', academy_id: 'a1' })).toEqual(['a1']);
    expect(saleAcademyIds({ academy_id: 'a2' })).toEqual(['a2']);
    expect(saleAcademyIds({})).toEqual([]);
  });

  it('saleBelongsToAcademy accepts legacy docs without academy fields', () => {
    expect(saleBelongsToAcademy({}, 'acad-1')).toBe(true);
  });

  it('saleBelongsToAcademy matches either attribute', () => {
    expect(saleBelongsToAcademy({ academy_id: 'acad-1' }, 'acad-1')).toBe(true);
    expect(saleBelongsToAcademy({ academyId: 'acad-1' }, 'acad-1')).toBe(true);
    expect(saleBelongsToAcademy({ academy_id: 'other' }, 'acad-1')).toBe(false);
  });

  it('filterSalesForAcademy drops mismatched legacy rows', () => {
    const rows = [
      { $id: '1', academyId: 'acad-1' },
      { $id: '2', academy_id: 'acad-1' },
      { $id: '3', academy_id: 'other' },
      { $id: '4' },
    ];
    expect(filterSalesForAcademy(rows, 'acad-1').map((r) => r.$id)).toEqual(['1', '2', '4']);
  });
});
