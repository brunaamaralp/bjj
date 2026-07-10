/** Configuração operacional de empréstimo de kimono (academy.settings.kimonoLoan). */

export const DEFAULT_KIMONO_LOAN_OVERDUE_HOURS = 4;

export function readKimonoLoanSettings(settings) {
  const raw = settings?.kimonoLoan;
  if (!raw || typeof raw !== 'object') {
    return { overdueHours: DEFAULT_KIMONO_LOAN_OVERDUE_HOURS };
  }
  const h = Number(raw.overdueHours);
  return {
    overdueHours: Number.isFinite(h) && h >= 1 && h <= 72 ? Math.trunc(h) : DEFAULT_KIMONO_LOAN_OVERDUE_HOURS,
  };
}

export function mergeKimonoLoanIntoSettings(settings, kimonoLoan) {
  const base = typeof settings === 'object' && settings && !Array.isArray(settings) ? { ...settings } : {};
  const h = Number(kimonoLoan?.overdueHours);
  return {
    ...base,
    kimonoLoan: {
      overdueHours:
        Number.isFinite(h) && h >= 1 && h <= 72 ? Math.trunc(h) : DEFAULT_KIMONO_LOAN_OVERDUE_HOURS,
    },
  };
}
