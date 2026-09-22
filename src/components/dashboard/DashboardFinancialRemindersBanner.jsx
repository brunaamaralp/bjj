import React from 'react';
import { Wallet, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Banner de lembretes financeiros no hero da Recepção.
 */
export default function DashboardFinancialRemindersBanner({
  sections = [],
  canOpenFinance = false,
}) {
  const navigate = useNavigate();
  const list = (sections || []).filter((s) => (s.items || []).length > 0);
  if (list.length === 0) return null;

  const go = (item) => {
    const href = String(item?.href || '').trim();
    if (!href) return;
    if (href.startsWith('/financeiro') && !canOpenFinance) return;
    navigate(href);
  };

  return (
    <div
      id="dashboard-financial-reminders"
      className="dashboard-financial-reminders"
      role="region"
      aria-label="Lembretes financeiros"
    >
      <div className="dashboard-financial-reminders__head">
        <Wallet size={18} strokeWidth={2} className="dashboard-financial-reminders__icon" aria-hidden />
        <p className="dashboard-financial-reminders__title">Lembretes financeiros</p>
      </div>
      <div className="dashboard-financial-reminders__sections">
        {list.map((section) => (
          <div key={section.id} className="dashboard-financial-reminders__section">
            <p className="dashboard-financial-reminders__section-title">{section.title}</p>
            <ul className="dashboard-financial-reminders__list">
              {(section.items || []).map((item) => {
                const clickable =
                  Boolean(item.href) &&
                  !(String(item.href).startsWith('/financeiro') && !canOpenFinance);
                return (
                  <li key={item.id}>
                    {clickable ? (
                      <button
                        type="button"
                        className="dashboard-financial-reminders__row"
                        onClick={() => go(item)}
                      >
                        <span className="dashboard-financial-reminders__row-text">
                          {item.title || item.label}
                        </span>
                        <ChevronRight size={14} aria-hidden />
                      </button>
                    ) : (
                      <span className="dashboard-financial-reminders__row dashboard-financial-reminders__row--static">
                        <span className="dashboard-financial-reminders__row-text">
                          {item.title || item.label}
                        </span>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
