import React, { useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { LEAD_STATUS } from '../store/useLeadStore';
import EmptyState from './shared/EmptyState.jsx';

function getSlotStatusKey(lead) {
    const status = String(lead?.status || '').trim();
    if (status === LEAD_STATUS.COMPLETED) return 'attended';
    if (status === LEAD_STATUS.MISSED) return 'missed';
    if (status === LEAD_STATUS.SCHEDULED && lead?.scheduledDate) return 'confirmed';
    return 'pending';
}

function buildSlotTooltip(lead, modalityLabel) {
    const name = String(lead?.name || 'Lead').trim();
    const type = modalityLabel || 'Aula experimental';
    const time =
        lead?.scheduledTime && String(lead.scheduledTime).trim() ? lead.scheduledTime : 'Horário não definido';
    return `${name} · ${type} · ${time}`;
}

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

/**
 * @param {number} [offset]
 * @param {{ endOnSaturday?: boolean }} [options] — se true, o fim do intervalo é sábado (grade sem domingo)
 */
export function formatWeekRangeLabel(offset = 0, options = {}) {
    const endOnSaturday = Boolean(options.endOnSaturday);
    const mon = getWeekStart(offset);
    const end = new Date(mon);
    end.setDate(mon.getDate() + (endOnSaturday ? 5 : 6));
    const short = (d) =>
        d
            .toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })
            .replace('.', '');
    const y = end.getFullYear();
    return `${short(mon)} – ${short(end)} ${y}`;
}

/** Intervalo seg–sáb (ou seg–dom) da semana civil com offset, em ms inclusivo. */
export function getCivilWeekBounds(offset = 0, endOnSaturday = true) {
    const mon = getWeekStart(offset);
    const end = new Date(mon);
    end.setDate(mon.getDate() + (endOnSaturday ? 5 : 6));
    end.setHours(23, 59, 59, 999);
    return { startMs: mon.getTime(), endMs: end.getTime() };
}

/** Leads com scheduledDate dentro da semana civil (padrão seg–sáb). */
export function filterLeadsInCivilWeek(leads, weekOffset = 0, endOnSaturday = true) {
    const { startMs, endMs } = getCivilWeekBounds(weekOffset, endOnSaturday);
    return (leads || []).filter((lead) => {
        const raw = String(lead?.scheduledDate || '').trim();
        if (!raw) return false;
        const [y, m, d] = raw.split('T')[0].split('-').map(Number);
        if (!Number.isFinite(y)) return false;
        const t = new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime();
        return t >= startMs && t <= endMs;
    });
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
 * @param {boolean} [props.hideSunday] — se true, exibe só seg–sáb (padrão: true)
 * @param {Record<string, boolean>} [props.savingPresence]
 * @param {boolean} [props.prioritizeTodayOnMobile] — no mobile, coluna de hoje primeiro
 */
export default function AgendaCalendarWeek({
    leads,
    onOpenLead,
    onCompareceu,
    onNaoCompareceu,
    savingPresence = {},
    weekOffset: weekOffsetProp,
    onWeekOffsetChange,
    hideNav = false,
    hideSunday = true,
    prioritizeTodayOnMobile = false,
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

    const displayDayDates = useMemo(
        () => (hideSunday ? dayDates.slice(0, 6) : dayDates),
        [hideSunday, dayDates]
    );

    const orderedDayDates = useMemo(() => {
        if (!prioritizeTodayOnMobile || weekOffset !== 0) return displayDayDates;
        const todayIdx = displayDayDates.findIndex((dayDate) => ymdOf(dayDate) === todayYmd);
        if (todayIdx <= 0) return displayDayDates;
        return [...displayDayDates.slice(todayIdx), ...displayDayDates.slice(0, todayIdx)];
    }, [displayDayDates, prioritizeTodayOnMobile, weekOffset, todayYmd]);

    const weekHasAny = useMemo(
        () => displayDayDates.some((dayDate) => (weekLeadsByYmd[ymdOf(dayDate)] || []).length > 0),
        [displayDayDates, weekLeadsByYmd]
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
                    <EmptyState
                        variant="compact"
                        tone="dashed"
                        icon={Calendar}
                        title="Nenhum agendamento nesta semana."
                        role="status"
                        className="agenda-week-week-empty"
                    />
                ) : (
                    <div className={`agenda-week-grid${hideSunday ? ' agenda-week-grid--six' : ''}`}>
                        {orderedDayDates.map((dayDate) => {
                            const key = ymdOf(dayDate);
                            const colLeads = weekLeadsByYmd[key] || [];
                            const isToday = key === todayYmd;
                            const isDenseColumn = colLeads.length >= 6;
                            const isEmptyColumn = colLeads.length === 0;
                            const dow = WEEKDAY_SHORT[(dayDate.getDay() + 6) % 7];
                            const dayNum = dayDate.getDate();

                            return (
                                <div
                                    key={key}
                                    ref={isToday ? todayColRef : null}
                                    className={`agenda-week-col${isToday ? ' agenda-week-col--today' : ''}${
                                        isDenseColumn ? ' agenda-week-col--dense' : ''
                                    }${isEmptyColumn ? ' agenda-week-col--empty' : ''}`}
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
                                            const attendedSelected = lead?.status === LEAD_STATUS.COMPLETED;
                                            const missedSelected = lead?.status === LEAD_STATUS.MISSED;
                                            const slotStatus = getSlotStatusKey(lead);
                                            const tooltip = buildSlotTooltip(lead, modality);
                                            const busyAttended = Boolean(savingPresence[`${lead.id}:attended`]);
                                            const busyMissed = Boolean(savingPresence[`${lead.id}:missed`]);
                                            const showPresence =
                                                !attendedSelected &&
                                                !missedSelected &&
                                                (typeof onCompareceu === 'function' || typeof onNaoCompareceu === 'function');
                                            return (
                                                <div
                                                    key={lead.id}
                                                    className={`agenda-week-card agenda-week-card--lead card${
                                                        attendedSelected ? ' agenda-week-card--attended' : ''
                                                    }${missedSelected ? ' agenda-week-card--missed' : ''}`}
                                                    title={tooltip}
                                                >
                                                    <button
                                                        type="button"
                                                        className="agenda-week-card-head"
                                                        onClick={() => onOpenLead?.(lead)}
                                                        title={tooltip}
                                                    >
                                                        <span
                                                            className={`agenda-week-status-dot agenda-week-status-dot--${slotStatus}`}
                                                            aria-hidden
                                                        />
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
                                                    {showPresence ? (
                                                        <div className="agenda-week-presence">
                                                            {typeof onCompareceu === 'function' ? (
                                                                <button
                                                                    type="button"
                                                                    className="agenda-week-presence-btn agenda-week-presence-btn--yes"
                                                                    disabled={busyAttended || busyMissed}
                                                                    onClick={() => onCompareceu(lead)}
                                                                >
                                                                    {busyAttended ? 'Salvando…' : 'Compareceu'}
                                                                </button>
                                                            ) : null}
                                                            {typeof onNaoCompareceu === 'function' ? (
                                                                <button
                                                                    type="button"
                                                                    className="agenda-week-presence-btn agenda-week-presence-btn--no"
                                                                    disabled={busyAttended || busyMissed}
                                                                    onClick={() => onNaoCompareceu(lead)}
                                                                >
                                                                    {busyMissed ? 'Salvando…' : 'Não veio'}
                                                                </button>
                                                            ) : null}
                                                        </div>
                                                    ) : null}
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
          margin-bottom: 4px;
        }
        .agenda-week-grid {
          display: grid;
          grid-template-columns: repeat(7, minmax(72px, 1fr));
          gap: 10px;
          padding-inline: 0;
          padding-bottom: 4px;
          align-items: stretch;
          width: 100%;
          min-width: 100%;
        }
        .agenda-week-grid--six {
          grid-template-columns: repeat(6, minmax(72px, 1fr));
        }
        @media (max-width: 980px) {
          .agenda-week-nav { position: static; }
        }
        .agenda-week-col {
          flex: 0 0 auto;
          width: 100%;
          min-width: 0;
          max-width: 100%;
          border-radius: var(--radius-sm);
          border: 1px solid var(--border-mid);
          background: var(--surface);
          min-height: 140px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
          display: flex;
          flex-direction: column;
          transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }
        .agenda-week-col:hover {
          border-color: rgba(0, 68, 102, 0.28);
          box-shadow: 0 2px 8px rgba(0, 68, 102, 0.08);
        }
        .agenda-week-col--today {
          background: rgba(0, 68, 102, 0.1);
          border-color: rgba(0, 68, 102, 0.35);
          box-shadow: inset 0 0 0 1px rgba(0, 68, 102, 0.08);
        }
        .agenda-week-col--empty {
          opacity: 0.78;
        }
        .agenda-week-col--empty .agenda-week-col-empty {
          font-size: 11px;
          opacity: 0.45;
          font-weight: 500;
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
          width: 32px;
          height: 32px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .agenda-week-day-num--today {
          background: var(--petroleo);
          color: #fff;
          border-radius: 50%;
          font-size: 14px;
          font-weight: 700;
        }
        .agenda-week-col--today .agenda-week-col-head {
          background: rgba(0, 68, 102, 0.06);
        }
        .agenda-week-col-body {
          padding: 10px 8px 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          flex: 1 1 auto;
          min-height: 88px;
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
        .agenda-week-week-empty.navi-empty {
          margin: 0;
          max-width: none;
        }
        .agenda-week-card {
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 0;
          min-height: 104px;
          min-width: 0;
          width: 100%;
          box-sizing: border-box;
          overflow: hidden;
          padding: 8px 10px !important;
          border-radius: 10px !important;
          border: 1px solid rgba(0, 68, 102, 0.14) !important;
          box-shadow: none;
          transition: transform 0.18s ease, box-shadow 0.2s ease, border-color 0.2s ease, filter 0.15s ease;
        }
        .agenda-week-card--lead {
          background: var(--accent-light) !important;
        }
        .agenda-week-card:hover {
          transform: translateY(-1px);
          border-color: rgba(0, 68, 102, 0.28) !important;
          box-shadow: 0 2px 8px rgba(0, 68, 102, 0.12);
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
          min-height: 104px;
          padding: 10px 10px 12px !important;
          border-radius: 12px !important;
        }
        .agenda-week-col--dense .agenda-week-card-head {
          padding: 0;
          gap: 4px;
        }
        .agenda-week-col--dense .agenda-week-name {
          font-size: 0.82rem;
          line-height: 1.28;
        }
        .agenda-week-col--dense .agenda-week-mod {
          font-size: 0.7rem;
        }
        .agenda-week-status-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          flex-shrink: 0;
          margin-bottom: 2px;
        }
        .agenda-week-status-dot--confirmed { background: var(--v500); }
        .agenda-week-status-dot--pending { background: #d97706; }
        .agenda-week-status-dot--attended { background: #16a34a; }
        .agenda-week-status-dot--missed { background: #e24b4a; }
        .agenda-week-card-head {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          width: 100%;
          flex: 1 1 auto;
          min-height: 0;
          background: none;
          border: none;
          padding: 0;
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
          display: block;
          width: 100%;
          max-width: 100%;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agenda-week-mod {
          display: block;
          margin-top: 0;
          font-size: 11px;
          line-height: 1.2;
          font-weight: 400;
          color: var(--text-secondary);
          width: 100%;
          max-width: 100%;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .agenda-week-presence {
          display: flex;
          flex-shrink: 0;
          flex-wrap: wrap;
          gap: 3px;
          margin-top: auto;
          padding-top: 4px;
          width: 100%;
          min-width: 0;
          align-items: center;
        }
        .agenda-week-presence-btn {
          flex: 0 1 calc(50% - 2px);
          min-width: 0;
          min-height: 18px !important;
          height: 18px;
          padding: 0 5px !important;
          border-radius: 999px;
          font-size: 0.5625rem !important;
          font-weight: 600;
          font-family: inherit;
          line-height: 1;
          letter-spacing: -0.02em;
          cursor: pointer;
          border: 1px solid var(--border-mid);
          background: var(--surface);
          color: var(--text-secondary);
          transition: border-color 0.15s ease, color 0.15s ease, background 0.15s ease;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          transform: none;
          box-shadow: none;
        }
        .agenda-week-presence-btn:hover:not(:disabled) {
          border-color: var(--border-strong);
          color: var(--ink);
        }
        .agenda-week-presence-btn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .agenda-week-presence-btn--yes:hover:not(:disabled) {
          border-color: rgba(22, 163, 74, 0.45);
          color: #15803d;
          background: rgba(16, 185, 129, 0.08);
        }
        .agenda-week-presence-btn--no:hover:not(:disabled) {
          border-color: rgba(226, 75, 74, 0.45);
          color: #b91c1c;
          background: rgba(239, 68, 68, 0.06);
        }
      `}</style>
        </div>
    );
}
