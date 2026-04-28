import React, { useMemo, useRef, useState } from 'react';

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Segunda-feira da semana civil que contém “hoje”, com offset em semanas. */
function getWeekStart(offset = 0) {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function parseLeadLocalDate(lead) {
    const raw = String(lead?.scheduledDate || '').trim();
    if (!raw) return null;
    const [y, m, d] = raw.split('T')[0].split('-').map(Number);
    if (!Number.isFinite(y)) return null;
    return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

function formatDayHeader(date) {
    const dow = WEEKDAY_SHORT[(date.getDay() + 6) % 7];
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    return `${dow} ${dd}/${mm}`;
}

function timeSortMinutes(lead) {
    const t = lead?.scheduledTime;
    if (t && /^\d{2}:\d{2}$/.test(String(t))) {
        const [h, mi] = String(t).split(':').map(Number);
        if (Number.isFinite(h) && Number.isFinite(mi)) return h * 60 + mi;
    }
    return 24 * 60 + 59;
}

/**
 * @param {object} props
 * @param {object[]} props.leads — `agendaLeads` do Dashboard (já filtrados)
 * @param {(lead: object) => void} props.onCompareceu
 * @param {(lead: object) => void} props.onNaoCompareceu
 * @param {(lead: object) => void} props.onOpenLead
 * @param {Record<string, boolean>} [props.savingPresence]
 */
export default function AgendaCalendarWeek({
    leads,
    onCompareceu,
    onNaoCompareceu,
    onOpenLead,
    savingPresence = {},
}) {
    const [weekOffset, setWeekOffset] = useState(0);
    const weekScrollRef = useRef(null);
    const todayColRef = useRef(null);

    const { dayDates, weekLeadsByYmd, todayYmd } = useMemo(() => {
        const monday0 = getWeekStart(weekOffset);
        const sunday = new Date(monday0);
        sunday.setDate(monday0.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const dates = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday0);
            d.setDate(monday0.getDate() + i);
            d.setHours(0, 0, 0, 0);
            dates.push(d);
        }

        const pad = (n) => String(n).padStart(2, '0');
        const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        const now = new Date();
        const tYmd = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0));

        const mon = monday0.getTime();
        const sunEnd = sunday.getTime();

        const filtered = (leads || []).filter((lead) => {
            const d = parseLeadLocalDate(lead);
            if (!d) return false;
            const t = d.getTime();
            return t >= mon && t <= sunEnd;
        });

        const byYmd = {};
        for (const lead of filtered) {
            const d = parseLeadLocalDate(lead);
            const key = ymd(d);
            if (!byYmd[key]) byYmd[key] = [];
            byYmd[key].push(lead);
        }
        for (const key of Object.keys(byYmd)) {
            byYmd[key].sort((a, b) => timeSortMinutes(a) - timeSortMinutes(b));
        }

        return {
            dayDates: dates,
            weekLeadsByYmd: byYmd,
            todayYmd: tYmd,
        };
    }, [leads, weekOffset]);

    const pad = (n) => String(n).padStart(2, '0');
    const ymdOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    return (
        <div className="agenda-week-root">
            <div className="flex items-center justify-between flex-wrap agenda-week-nav" style={{ gap: 10, marginBottom: 14 }}>
                <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset((o) => o - 1)}>
                    &lt; Anterior
                </button>
                <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                    <button
                        type="button"
                        className="btn-secondary agenda-week-nav-btn"
                        onClick={() => {
                            setWeekOffset(0);
                            requestAnimationFrame(() => {
                                if (todayColRef.current) {
                                    todayColRef.current.scrollIntoView({
                                        behavior: 'smooth',
                                        inline: 'center',
                                        block: 'nearest',
                                    });
                                } else if (weekScrollRef.current) {
                                    weekScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
                                }
                            });
                        }}
                    >
                        Hoje
                    </button>
                </div>
                <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset((o) => o + 1)}>
                    Próxima &gt;
                </button>
            </div>

            <div ref={weekScrollRef} className="agenda-week-scroll">
                <div className="agenda-week-grid">
                    {dayDates.map((dayDate) => {
                        const key = ymdOf(dayDate);
                        const colLeads = weekLeadsByYmd[key] || [];
                        const isToday = key === todayYmd;
                        const isDenseColumn = colLeads.length >= 6;

                        return (
                            <div
                                key={key}
                                ref={isToday ? todayColRef : null}
                                className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}${isDenseColumn ? ' agenda-week-col--dense' : ''}`}
                            >
                                <div className="agenda-week-col-head">
                                    <span className="agenda-week-col-head-label">{formatDayHeader(dayDate)}</span>
                                </div>
                                <div className="agenda-week-col-body">
                                    {colLeads.length === 0 ? (
                                        <div className="agenda-week-empty-wrap">
                                            <p className="agenda-week-empty">Sem agendamentos</p>
                                        </div>
                                    ) : (
                                        colLeads.map((lead) => {
                                            const busy =
                                                Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`]);
                                            const modality = String(lead?.type || '').trim();
                                            const attendedSelected = lead?.status === 'Compareceu';
                                            const missedSelected = lead?.status === 'Não Compareceu';
                                            return (
                                                <div key={lead.id} className="agenda-week-card card">
                                                    <button
                                                        type="button"
                                                        className="agenda-week-card-head"
                                                        onClick={() => onOpenLead?.(lead)}
                                                    >
                                                        <span className="agenda-week-time">
                                                            {lead.scheduledTime && String(lead.scheduledTime).trim()
                                                                ? lead.scheduledTime
                                                                : '—:—'}
                                                        </span>
                                                        <span className="agenda-week-name">{lead.name}</span>
                                                        {modality ? (
                                                            <span className="agenda-week-mod">{modality}</span>
                                                        ) : null}
                                                    </button>
                                                    <div className="agenda-week-actions">
                                                        <button
                                                            type="button"
                                                            className={`agenda-week-action-btn agenda-week-action-btn--attended${
                                                                attendedSelected ? ' agenda-week-action-btn--active' : ''
                                                            }${missedSelected ? ' agenda-week-action-btn--faded' : ''}`}
                                                            disabled={busy}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onCompareceu?.(lead);
                                                            }}
                                                        >
                                                            {savingPresence[`${lead.id}:attended`] ? 'Salvando…' : 'Compareceu'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`agenda-week-action-btn agenda-week-action-btn--missed${
                                                                missedSelected ? ' agenda-week-action-btn--active' : ''
                                                            }${attendedSelected ? ' agenda-week-action-btn--faded' : ''}`}
                                                            disabled={busy}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onNaoCompareceu?.(lead);
                                                            }}
                                                        >
                                                            {savingPresence[`${lead.id}:missed`] ? 'Salvando…' : 'Não compareceu'}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <style>{`
        .agenda-week-root { width: 100%; max-width: 100%; }
        .agenda-week-nav-btn {
          font-size: 13px;
          padding: 8px 16px;
          min-height: 40px;
        }
        .agenda-week-nav {
          position: sticky;
          top: 0;
          z-index: 4;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 8px;
          box-shadow: 0 4px 14px rgba(18, 16, 42, 0.06);
        }
        .agenda-week-scroll {
          width: 100%;
          max-width: 100%;
          overflow-x: auto;
          overflow-y: visible;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x pan-y;
          overscroll-behavior-x: contain;
          margin-bottom: 4px;
          scroll-snap-type: x mandatory;
          scroll-padding-inline: 16px;
          scroll-behavior: smooth;
        }
        .agenda-week-grid {
          display: flex;
          gap: 8px;
          padding-inline: 16px;
          align-items: stretch;
        }
        .agenda-week-col {
          flex: 0 0 160px;
          width: 160px;
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          min-height: 120px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(18, 16, 42, 0.04);
          scroll-snap-align: start;
        }
        .agenda-week-col--today {
          background: rgba(91, 63, 191, 0.06);
          border-color: rgba(91, 63, 191, 0.22);
          border-top: 2px solid var(--v500);
        }
        .agenda-week-col-head {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary);
          padding: 10px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-bottom: 1px solid rgba(18, 16, 42, 0.08);
          background: transparent;
          position: sticky;
          top: 0;
          z-index: 2;
        }
        .agenda-week-col-head-label {
          min-width: 0;
          text-overflow: ellipsis;
          white-space: nowrap;
          overflow: hidden;
        }
        .agenda-week-col--today .agenda-week-col-head {
          background: rgba(91, 63, 191, 0.06);
        }
        .agenda-week-col-body {
          padding: 12px 12px 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .agenda-week-empty-wrap {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 120px;
        }
        .agenda-week-empty {
          text-align: center;
          margin: 0;
          font-size: 12px;
          color: var(--text-muted);
          opacity: 0.9;
        }
        .agenda-week-card {
          padding: 10px 12px !important;
          border-radius: 14px !important;
          border: 1px solid var(--border) !important;
          box-shadow: 0 1px 4px rgba(18, 16, 42, 0.04);
          transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .agenda-week-card:hover {
          transform: translateY(-2px);
          border-color: rgba(91, 63, 191, 0.22) !important;
          box-shadow: 0 4px 12px rgba(18, 16, 42, 0.08), 0 14px 34px rgba(91, 63, 191, 0.12);
        }
        .agenda-week-col--dense .agenda-week-col-body {
          gap: 10px;
        }
        .agenda-week-col--dense .agenda-week-card {
          padding: 10px 10px 12px !important;
          border-radius: 12px !important;
        }
        .agenda-week-col--dense .agenda-week-card-head {
          padding: 2px 1px 10px;
          gap: 3px;
        }
        .agenda-week-col--dense .agenda-week-name {
          font-size: 0.82rem;
          line-height: 1.28;
        }
        .agenda-week-col--dense .agenda-week-mod {
          font-size: 0.7rem;
        }
        .agenda-week-col--dense .agenda-week-action-btn {
          min-height: 34px;
          padding: 6px 8px;
          font-size: 0.7rem;
        }
        .agenda-week-card-head {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 5px;
          width: 100%;
          background: none;
          border: none;
          padding: 0;
          min-height: 0;
          box-sizing: border-box;
          cursor: pointer;
          text-align: left;
          font: inherit;
          color: inherit;
          -webkit-tap-highlight-color: transparent;
          min-width: 0;
        }
        .agenda-week-card-head:hover .agenda-week-name {
          color: var(--accent);
        }
        .agenda-week-time {
          font-size: 12px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: var(--v500);
          letter-spacing: 0.01em;
        }
        .agenda-week-name {
          font-size: 13px;
          font-weight: 500;
          line-height: 1.3;
          width: 100%;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agenda-week-mod {
          margin-top: 1px;
          font-size: 11px;
          line-height: 1.2;
          font-weight: 400;
          color: var(--text-secondary);
        }
        .agenda-week-actions {
          padding-top: 10px;
          display: flex;
          flex-direction: row;
          gap: 6px;
        }
        .agenda-week-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: auto;
          flex: 1;
          min-height: 0;
          min-width: 0;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          line-height: 1.1;
          white-space: nowrap;
          border-radius: 99px;
          border: 1px solid transparent;
          background: transparent;
          cursor: pointer;
        }
        .agenda-week-action-btn--attended {
          background: var(--success-light);
          border-color: rgba(16, 185, 129, 0.35);
          color: var(--success);
        }
        .agenda-week-action-btn--missed {
          background: transparent;
          border-color: rgba(18, 16, 42, 0.18);
          color: var(--text-secondary);
        }
        .agenda-week-action-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .agenda-week-action-btn--active {
          filter: saturate(1.05);
          box-shadow: 0 0 0 2px rgba(91, 63, 191, 0.12);
        }
        .agenda-week-action-btn--faded {
          opacity: 0.4;
        }
        @media (max-width: 980px) {
          .agenda-week-col-head { position: static; }
          .agenda-week-nav { position: static; }
        }
      `}</style>
        </div>
    );
}
