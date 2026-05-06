import React, { useMemo, useRef, useState } from 'react';

const WEEKDAY_SHORT = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/** Segunda-feira da semana civil que contém “hoje”, com offset em semanas. */
export function getWeekStart(offset = 0) {
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

export function formatWeekRangeLabel(offset = 0) {
    const mon = getWeekStart(offset);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const short = (d) =>
        d
            .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
            .replace('.', '');
    const y = sun.getFullYear();
    return `${short(mon)} – ${short(sun)} ${y}`;
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
 * @param {number} [props.weekOffset] — semana controlada pelo pai (com `onWeekOffsetChange`)
 * @param {(n: number) => void} [props.onWeekOffsetChange]
 * @param {boolean} [props.hideNav] — oculta Anterior/Próxima internos (navegação no pai)
 */
export default function AgendaCalendarWeek({
    leads,
    onOpenLead,
    weekOffset: weekOffsetProp,
    onWeekOffsetChange,
    hideNav = false,
}) {
    const [weekOffsetInternal, setWeekOffsetInternal] = useState(0);
    const controlled =
        typeof weekOffsetProp === 'number' && Number.isFinite(weekOffsetProp) && typeof onWeekOffsetChange === 'function';
    const weekOffset = controlled ? weekOffsetProp : weekOffsetInternal;
    const setWeekOffset = controlled ? onWeekOffsetChange : setWeekOffsetInternal;

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

    const weekHasAny = useMemo(
        () => dayDates.some((dayDate) => (weekLeadsByYmd[ymdOf(dayDate)] || []).length > 0),
        [dayDates, weekLeadsByYmd]
    );

    return (
        <div className="agenda-week-root">
            {!hideNav ? (
                <div className="flex items-center justify-between flex-wrap agenda-week-nav" style={{ gap: 10, marginBottom: 14 }}>
                    <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset((o) => o - 1)}>
                        &lt; Anterior
                    </button>
                    <button type="button" className="btn-secondary agenda-week-nav-btn" onClick={() => setWeekOffset((o) => o + 1)}>
                        Próxima &gt;
                    </button>
                </div>
            ) : null}

            <div ref={weekScrollRef} className="agenda-week-scroll">
                {!weekHasAny ? (
                    <p className="agenda-week-week-empty">Nenhum agendamento nesta semana.</p>
                ) : (
                    <div className="agenda-week-grid">
                        {dayDates.map((dayDate) => {
                            const key = ymdOf(dayDate);
                            const colLeads = weekLeadsByYmd[key] || [];
                            const isToday = key === todayYmd;
                            const isDenseColumn = colLeads.length >= 6;
                            const dow = WEEKDAY_SHORT[(dayDate.getDay() + 6) % 7];
                            const dayNum = dayDate.getDate();

                            return (
                                <div
                                    key={key}
                                    ref={isToday ? todayColRef : null}
                                    className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}${isDenseColumn ? ' agenda-week-col--dense' : ''}`}
                                >
                                    <div className="agenda-week-col-head">
                                        <span className="agenda-week-dow">{dow}</span>
                                        <span
                                            className={
                                                isToday ? 'agenda-week-day-num agenda-week-day-num--today' : 'agenda-week-day-num'
                                            }
                                        >
                                            {dayNum}
                                        </span>
                                    </div>
                                    <div className="agenda-week-col-body">
                                        {colLeads.length === 0 ? (
                                            <div className="agenda-week-col-empty">—</div>
                                        ) : null}
                                        {colLeads.map((lead) => {
                                            const modality = String(lead?.type || '').trim();
                                            const attendedSelected = lead?.status === 'Compareceu';
                                            const missedSelected = lead?.status === 'Não Compareceu';
                                            return (
                                                <div
                                                    key={lead.id}
                                                    className={`agenda-week-card agenda-week-card--lead card${
                                                        attendedSelected ? ' agenda-week-card--attended' : ''
                                                    }${missedSelected ? ' agenda-week-card--missed' : ''}`}
                                                >
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
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
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
          border: 1px solid var(--border-mid);
          border-radius: var(--radius-sm);
          padding: 10px 12px;
          box-shadow: var(--shadow-sm);
        }
        .agenda-week-scroll {
          width: 100%;
          max-width: 100%;
          overflow: visible;
          margin-bottom: 4px;
        }
        .agenda-week-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
          gap: 10px;
          padding-inline: 0;
          align-items: stretch;
        }
        @media (max-width: 1100px) {
          .agenda-week-grid {
            grid-template-columns: repeat(7, minmax(92px, 1fr));
            overflow-x: auto;
            overscroll-behavior-x: contain;
            padding-bottom: 8px;
            -webkit-overflow-scrolling: touch;
          }
          .agenda-week-col { min-width: 92px; }
        }
        @media (max-width: 640px) {
          .agenda-week-grid {
            grid-template-columns: 1fr;
            overflow-x: visible;
          }
          .agenda-week-col { min-width: 0; }
        }
        .agenda-week-col {
          flex: 0 0 auto;
          width: 100%;
          max-width: 100%;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-mid);
          background: var(--surface);
          min-height: 0;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
        }
        .agenda-week-col--today {
          background: rgba(91, 63, 191, 0.04);
          border-color: rgba(91, 63, 191, 0.25);
        }
        .agenda-week-col-head {
          padding: 12px 8px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 6px;
          border-bottom: 1px solid var(--border);
          background: transparent;
          position: static;
          z-index: 2;
          text-align: center;
        }
        .agenda-week-dow {
          font-size: 10px;
          font-weight: 700;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .agenda-week-day-num {
          font-size: 15px;
          font-weight: 800;
          color: var(--ink);
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .agenda-week-day-num--today {
          background: #5b3fbf;
          color: #fff;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }
        .agenda-week-col--today .agenda-week-col-head {
          background: rgba(91, 63, 191, 0.06);
        }
        .agenda-week-col-body {
          padding: 10px 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1 1 auto;
          min-height: 56px;
        }
        .agenda-week-col-empty {
          margin: auto 0;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-muted);
          text-align: center;
          opacity: 0.65;
          padding: 6px 4px;
        }
        .agenda-week-week-empty {
          margin: 0;
          padding: 14px 16px;
          font-size: 13px;
          color: var(--text-secondary);
          line-height: 1.45;
          background: var(--v50);
          border: 1px dashed var(--border-mid);
          border-radius: var(--radius-sm);
        }
        .agenda-week-card {
          padding: 8px 10px !important;
          border-radius: 10px !important;
          border: 1px solid rgba(91, 63, 191, 0.14) !important;
          box-shadow: none;
          transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease, filter 0.15s ease;
        }
        .agenda-week-card--lead {
          background: #eeedfe !important;
        }
        .agenda-week-card:hover {
          transform: translateY(-1px);
          border-color: rgba(91, 63, 191, 0.28) !important;
          box-shadow: 0 2px 8px rgba(91, 63, 191, 0.12);
          filter: brightness(0.99);
        }
        .agenda-week-card--attended {
          background: rgba(16, 185, 129, 0.12) !important;
          border-color: rgba(16, 185, 129, 0.28) !important;
        }
        .agenda-week-card--attended:hover {
          border-color: rgba(16, 185, 129, 0.32) !important;
        }
        .agenda-week-card--missed {
          background: rgba(239, 68, 68, 0.1) !important;
          border-color: rgba(239, 68, 68, 0.25) !important;
        }
        .agenda-week-card--missed:hover {
          border-color: rgba(239, 68, 68, 0.32) !important;
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
        @media (max-width: 980px) {
          .agenda-week-nav { position: static; }
        }
      `}</style>
        </div>
    );
}
