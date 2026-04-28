import React, { useMemo, useRef, useState } from 'react';
import { CheckCircle, XCircle } from 'lucide-react';

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
                    &lt; Semana anterior
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
                    Próxima semana &gt;
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
                                    {isToday ? <span className="agenda-week-today-badge">Hoje</span> : null}
                                </div>
                                <div className="agenda-week-col-body">
                                    {colLeads.length === 0 ? (
                                        <p className="text-xs text-light agenda-week-empty">Sem agendamentos</p>
                                    ) : (
                                        colLeads.map((lead) => {
                                            const busy =
                                                Boolean(savingPresence[`${lead.id}:attended`] || savingPresence[`${lead.id}:missed`]);
                                            const modality = String(lead?.type || '').trim();
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
                                                            <span className="text-xs text-light agenda-week-mod">{modality}</span>
                                                        ) : null}
                                                    </button>
                                                    <div className="agenda-week-actions">
                                                        <button
                                                            type="button"
                                                            className="btn-success agenda-week-action-btn"
                                                            disabled={busy}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onCompareceu?.(lead);
                                                            }}
                                                        >
                                                            <CheckCircle size={16} aria-hidden />
                                                            {savingPresence[`${lead.id}:attended`] ? 'Salvando…' : 'Compareceu'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="btn-outline agenda-week-action-btn"
                                                            disabled={busy}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                onNaoCompareceu?.(lead);
                                                            }}
                                                        >
                                                            <XCircle size={16} aria-hidden />
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
          font-size: 0.8rem;
          padding: 10px 14px;
          min-height: 44px;
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
        }
        .agenda-week-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(154px, 1fr));
          gap: 12px;
          min-width: 1120px;
          align-items: start;
        }
        .agenda-week-col {
          border-radius: 16px;
          border: 1px solid var(--border);
          background: var(--surface);
          min-height: 120px;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(18, 16, 42, 0.04);
        }
        .agenda-week-col--today {
          background: rgba(91, 63, 191, 0.06);
          border-color: rgba(91, 63, 191, 0.22);
          box-shadow: 0 0 0 1px rgba(91, 63, 191, 0.2), 0 10px 24px rgba(91, 63, 191, 0.1);
        }
        .agenda-week-col-head {
          font-size: 0.74rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--v500);
          padding: 12px 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-bottom: 1px solid rgba(91, 63, 191, 0.12);
          background: rgba(91, 63, 191, 0.04);
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
        .agenda-week-today-badge {
          font-size: 0.62rem;
          line-height: 1;
          padding: 4px 7px;
          border-radius: 999px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          background: var(--v500);
          color: #fff;
          flex: 0 0 auto;
        }
        .agenda-week-col--today .agenda-week-col-head {
          background: rgba(91, 63, 191, 0.12);
        }
        .agenda-week-col-body {
          padding: 12px 10px 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .agenda-week-empty {
          text-align: center;
          padding: 12px 4px;
          margin: 0;
          opacity: 0.85;
        }
        .agenda-week-card {
          padding: 12px 12px 14px !important;
          border-radius: 14px !important;
          border: 1px solid var(--border) !important;
          border-left: 3px solid var(--accent) !important;
          box-shadow: 0 1px 4px rgba(18, 16, 42, 0.04), 0 8px 22px rgba(91, 63, 191, 0.08);
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
          padding: 4px 2px 12px;
          min-height: 44px;
          box-sizing: border-box;
          cursor: pointer;
          text-align: left;
          font: inherit;
          color: inherit;
          -webkit-tap-highlight-color: transparent;
        }
        .agenda-week-card-head:hover .agenda-week-name {
          color: var(--accent);
        }
        .agenda-week-time {
          font-size: 0.8rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--v500);
          letter-spacing: 0.01em;
        }
        .agenda-week-name {
          font-size: 0.88rem;
          font-weight: 700;
          line-height: 1.35;
          word-break: break-word;
        }
        .agenda-week-mod {
          margin-top: 1px;
          font-size: 0.74rem;
          line-height: 1.3;
        }
        .agenda-week-actions {
          padding-top: 8px;
          border-top: 1px solid rgba(91, 63, 191, 0.09);
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .agenda-week-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          min-height: 30px;
          min-width: 0;
          padding: 5px 8px;
          font-size: 0.68rem;
          font-weight: 700;
          line-height: 1.1;
          white-space: nowrap;
          border-radius: 7px;
        }
        .agenda-week-action-btn svg {
          flex: 0 0 auto;
          width: 12px;
          height: 12px;
        }
        @media (max-width: 1280px) {
          .agenda-week-grid {
            grid-template-columns: repeat(7, minmax(136px, 1fr));
            min-width: 980px;
            gap: 10px;
          }
        }
        @media (max-width: 980px) {
          .agenda-week-grid {
            grid-template-columns: repeat(7, minmax(120px, 1fr));
            min-width: 840px;
            gap: 8px;
          }
          .agenda-week-col-body {
            padding: 10px 8px 12px;
          }
          .agenda-week-card {
            padding: 10px 10px 12px !important;
          }
          .agenda-week-col-head {
            position: static;
          }
          .agenda-week-nav {
            position: static;
          }
        }
        @media (max-width: 640px) {
          .agenda-week-nav {
            position: static;
            flex-direction: column;
            align-items: stretch;
          }
          .agenda-week-nav > .btn-secondary { width: 100%; }
          .agenda-week-grid {
            grid-template-columns: repeat(7, minmax(108px, 1fr));
            min-width: 760px;
          }
          .agenda-week-col-body {
            padding: 8px 6px 10px;
            gap: 8px;
          }
          .agenda-week-card {
            padding: 8px 8px 10px !important;
            border-radius: 10px !important;
          }
        }
      `}</style>
        </div>
    );
}
