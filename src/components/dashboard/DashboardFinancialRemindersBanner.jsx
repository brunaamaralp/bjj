import React, { useMemo, useState } from 'react';
import { Wallet, ChevronRight, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Banner de lembretes financeiros no hero da Recepção.
 * Recolhido por padrão; expandido só no clique do cabeçalho.
 */
export default function DashboardFinancialRemindersBanner({
  sections = [],
  canOpenFinance = false,
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const list = useMemo(
    () => (sections || []).filter((s) => (s.items || []).length > 0),
    [sections]
  );

  const itemCount = useMemo(
    () => list.reduce((n, s) => n + (s.items || []).length, 0),
    [list]
  );

  if (list.length === 0) return null;

  const go = (item) => {
    const href = String(item?.href || '').trim();
    if (!href) return;
    if (href.startsWith('/financeiro') && !canOpenFinance) return;
    navigate(href);
  };

  const bodyId = 'dashboard-financial-reminders-body';

  return (
    <div
      id="dashboard-financial-reminders"
      className={`dashboard-financial-reminders${expanded ? '' : ' dashboard-financial-reminders--collapsed'}`}
      role="region"
      aria-label="Lembretes financeiros"
    >
      <button
        type="button"
        className="dashboard-financial-reminders__toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={bodyId}
      >
        <span className="dashboard-financial-reminders__head">
          <Wallet size={18} strokeWidth={2} className="dashboard-financial-reminders__icon" aria-hidden />
          <p className="dashboard-financial-reminders__title">Lembretes financeiros</p>
          <span className="badge badge-secondary dashboard-financial-reminders__count">{itemCount}</span>
        </span>
        <ChevronDown
          size={18}
          strokeWidth={2}
          className={`dashboard-financial-reminders__chevron${expanded ? ' dashboard-financial-reminders__chevron--open' : ''}`}
          aria-hidden
        />
      </button>
      {expanded ? (
        <div id={bodyId} className="dashboard-financial-reminders__sections">
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
      ) : null}
    </div>
  );
}
