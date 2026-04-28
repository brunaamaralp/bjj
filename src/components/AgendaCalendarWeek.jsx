import React, { useMemo, useState } from 'react';
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
                    <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset(0)}>
                        Hoje
                    </button>
                </div>
                <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset((o) => o + 1)}>
                    Próxima semana &gt;
                </button>
            </div>

            <div className="agenda-week-scroll">
                <div className="agenda-week-grid">
                    {dayDates.map((dayDate) => {
                        const key = ymdOf(dayDate);
                        const colLeads = weekLeadsByYmd[key] || [];
                        const isToday = key === todayYmd;

                        return (
                            <div
                                key={key}
                                className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}`}
                            >
                                <div className="agenda-week-col-head">{formatDayHeader(dayDate)}</div>
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
          grid-template-columns: repeat(7, minmax(112px, 1fr));
          gap: 10px;
          min-width: 780px;
          align-items: start;
        }
        .agenda-week-col {
          border-radius: 12px;
          border: 1px solid var(--border);
          background: var(--surface);
          min-height: 120px;
          overflow: hidden;
        }
        .agenda-week-col--today {
          background: rgba(91, 63, 191, 0.06);
          border-color: rgba(91, 63, 191, 0.22);
        }
        .agenda-week-col-head {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--v500);
          padding: 10px 8px;
          text-align: center;
          border-bottom: 1px solid rgba(91, 63, 191, 0.12);
          background: rgba(91, 63, 191, 0.04);
        }
        .agenda-week-col--today .agenda-week-col-head {
          background: rgba(91, 63, 191, 0.12);
        }
        .agenda-week-col-body {
          padding: 8px 6px 10px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agenda-week-empty {
          text-align: center;
          padding: 12px 4px;
          margin: 0;
          opacity: 0.85;
        }
        .agenda-week-card {
          padding: 8px 8px 10px !important;
          border-radius: 10px !important;
          border: 1px solid var(--border) !important;
          border-left: 3px solid var(--accent) !important;
          box-shadow: 0 1px 4px rgba(18, 16, 42, 0.05);
        }
        .agenda-week-card-head {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          width: 100%;
          background: none;
          border: none;
          padding: 6px 2px 10px;
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
          font-size: 0.75rem;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          color: var(--v500);
        }
        .agenda-week-name {
          font-size: 0.8rem;
          font-weight: 700;
          line-height: 1.25;
          word-break: break-word;
        }
        .agenda-week-mod {
          margin-top: 2px;
        }
        .agenda-week-actions {
          padding-top: 8px;
          border-top: 1px solid rgba(91, 63, 191, 0.09);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .agenda-week-action-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          min-height: 44px;
          min-width: 0;
          padding: 10px 10px;
          font-size: 0.78rem;
          font-weight: 700;
          line-height: 1.2;
          flex-wrap: wrap;
        }
        @media (max-width: 640px) {
          .agenda-week-nav { flex-direction: column; align-items: stretch; }
          .agenda-week-nav > .btn-secondary { width: 100%; }
        }
      `}</style>
        </div>
    );
}
