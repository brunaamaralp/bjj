import { DEFAULT_STOCK_CHECK_SCHEDULE } from './stockInventory.js';

export function parseAcademySettings(raw) {
  if (!raw) return {};
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch {
    return {};
  }
}

export function readStockCheckSchedule(settings) {
  const s = settings?.stockCheckSchedule;
  if (!s || typeof s !== 'object') {
    return { ...DEFAULT_STOCK_CHECK_SCHEDULE };
  }
  const day = Number(s.dayOfWeek);
  return {
    enabled: s.enabled === true,
    dayOfWeek: Number.isFinite(day) && day >= 0 && day <= 6 ? day : DEFAULT_STOCK_CHECK_SCHEDULE.dayOfWeek,
    taskTitle: String(s.taskTitle || '').trim() || DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle,
  };
}

/** Verdadeiro quando a academia já salvou conferência de estoque em settings. */
export function stockSettingsHasPersistedData(settings) {
  const s = parseAcademySettings(settings);
  return Object.prototype.hasOwnProperty.call(s, 'stockCheckSchedule');
}

export function mergeStockCheckIntoSettings(settings, stockCheckSchedule) {
  const base = parseAcademySettings(settings);
  return {
    ...base,
    stockCheckSchedule: {
      enabled: stockCheckSchedule.enabled === true,
      dayOfWeek: stockCheckSchedule.dayOfWeek,
      taskTitle: String(stockCheckSchedule.taskTitle || '').trim() || DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle,
    },
  };
}

export function academyHasInventoryModule(academyDoc) {
  try {
    const mods = typeof academyDoc?.modules === 'string' ? JSON.parse(academyDoc.modules) : academyDoc?.modules;
    return mods?.inventory === true;
  } catch {
    return false;
  }
}

export function academyHasSalesModule(academyDoc) {
  try {
    const mods = typeof academyDoc?.modules === 'string' ? JSON.parse(academyDoc.modules) : academyDoc?.modules;
    return mods?.sales === true;
  } catch {
    return false;
  }
}

export function academyHasProductsAccess(academyDoc) {
  return academyHasInventoryModule(academyDoc) || academyHasSalesModule(academyDoc);
}

export function academyHasFinanceModule(academyDoc) {
  try {
    const mods = typeof academyDoc?.modules === 'string' ? JSON.parse(academyDoc.modules) : academyDoc?.modules;
    return mods?.finance === true;
  } catch {
    return false;
  }
}

export function nextOccurrenceYmd(dayOfWeek, fromDate = new Date()) {
  const target = Math.trunc(Number(dayOfWeek));
  const d = new Date(fromDate);
  d.setHours(12, 0, 0, 0);
  const current = d.getDay();
  let add = target - current;
  if (add < 0) add += 7;
  d.setDate(d.getDate() + add);
  return d.toISOString().slice(0, 10);
}
