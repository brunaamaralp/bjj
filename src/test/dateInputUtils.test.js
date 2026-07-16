import { describe, it, expect } from 'vitest';
import {
  isoDateToBr,
  parseBrDateToIso,
  maskBrDateTyping,
  isoMonthToBr,
  parseBrMonthToIso,
  isoDatetimeLocalToBr,
  parseBrDatetimeToIsoLocal,
  maskBrDatetimeTyping,
  isIsoDateYmd,
  defaultDeferredDueYmd,
  shouldSuppressDateFieldBlur,
  resolveTypableDateBlur,
} from '../lib/dateInputUtils.js';

describe('dateInputUtils', () => {
  it('converte ISO ↔ BR para data', () => {
    expect(isoDateToBr('2026-05-30')).toBe('30/05/2026');
    expect(parseBrDateToIso('30/05/2026')).toBe('2026-05-30');
    expect(parseBrDateToIso('31/02/2026')).toBeNull();
  });

  it('valida YYYY-MM-DD e sugere vencimento a prazo', () => {
    expect(isIsoDateYmd('2026-08-12')).toBe(true);
    expect(isIsoDateYmd('12/08/2026')).toBe(false);
    expect(isIsoDateYmd('')).toBe(false);
    expect(defaultDeferredDueYmd(new Date(2026, 6, 13))).toBe('2026-08-12');
  });

  it('mascara digitação de data', () => {
    expect(maskBrDateTyping('30052026')).toBe('30/05/2026');
  });

  it('converte ISO ↔ BR para mês', () => {
    expect(isoMonthToBr('2026-05')).toBe('05/2026');
    expect(parseBrMonthToIso('05/2026')).toBe('2026-05');
  });

  it('converte ISO ↔ BR para datetime-local', () => {
    expect(isoDatetimeLocalToBr('2026-05-30T14:30')).toBe('30/05/2026 14:30');
    expect(parseBrDatetimeToIsoLocal('30/05/2026 14:30')).toBe('2026-05-30T14:30');
    expect(maskBrDatetimeTyping('300520261430')).toBe('30/05/2026 14:30');
  });
});

describe('date blur helpers (inline autosave)', () => {
  it('suppresses blur when focus moves to native picker or field chrome', () => {
    const field = { contains: (n) => n === 'btn' };
    const picker = { contains: (n) => n === 'inner' };
    expect(shouldSuppressDateFieldBlur(null, field, picker)).toBe(false);
    expect(shouldSuppressDateFieldBlur(picker, field, picker)).toBe(true);
    expect(shouldSuppressDateFieldBlur('inner', field, picker)).toBe(true);
    expect(shouldSuppressDateFieldBlur('btn', field, picker)).toBe(true);
    expect(shouldSuppressDateFieldBlur('outside', field, picker)).toBe(false);
  });

  it('resolveTypableDateBlur returns ISO sync for commit', () => {
    expect(resolveTypableDateBlur('date', '15/03/2026', '2020-01-01')).toEqual({
      iso: '2026-03-15',
      valid: true,
    });
    expect(resolveTypableDateBlur('date', '', '2020-01-01')).toEqual({ iso: '', valid: true });
    expect(resolveTypableDateBlur('date', '99/99/2026', '2020-01-01')).toEqual({
      iso: '2020-01-01',
      valid: false,
    });
  });
});
