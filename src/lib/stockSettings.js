import {
  DEFAULT_STOCK_CHECK_SCHEDULE,
  DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY,
} from './stockInventory.js';

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

export function readStockPurchaseExpenseCategory(settings) {
  const cat = String(settings?.stockPurchaseExpenseCategory || '').trim();
  return cat || DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY;
}

export function readStockSaleIncomeCategory(settings) {
  const cat = String(settings?.stockSaleIncomeCategory || '').trim();
  return cat || 'Vendas — produtos';
}

/** Verdadeiro quando a academia já salvou pelo menos um campo de estoque em settings. */
export function stockSettingsHasPersistedData(settings) {
  const s = parseAcademySettings(settings);
  return (
    Object.prototype.hasOwnProperty.call(s, 'stockCheckSchedule') ||
    Object.prototype.hasOwnProperty.call(s, 'stockPurchaseExpenseCategory')
  );
}

export function mergeStockCheckIntoSettings(
  settings,
  stockCheckSchedule,
  stockPurchaseExpenseCategory,
  stockSaleIncomeCategory
) {
  const base = parseAcademySettings(settings);
  const merged = {
    ...base,
    stockCheckSchedule: {
      enabled: stockCheckSchedule.enabled === true,
      dayOfWeek: stockCheckSchedule.dayOfWeek,
      taskTitle: String(stockCheckSchedule.taskTitle || '').trim() || DEFAULT_STOCK_CHECK_SCHEDULE.taskTitle,
    },
    stockPurchaseExpenseCategory:
      String(stockPurchaseExpenseCategory || '').trim() || DEFAULT_STOCK_PURCHASE_EXPENSE_CATEGORY,
  };
  if (stockSaleIncomeCategory != null) {
    merged.stockSaleIncomeCategory =
      String(stockSaleIncomeCategory || '').trim() || readStockSaleIncomeCategory(base);
  }
  return merged;
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

/** Catálogo de produtos: estoque e/ou vendas. */
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

/** Próxima data (YYYY-MM-DD) caindo no dayOfWeek (0=dom … 6=sáb), inclusive hoje se for o dia. */
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
