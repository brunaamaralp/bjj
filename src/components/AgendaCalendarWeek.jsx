import React, { useMemo, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { LEAD_STATUS } from '../store/useLeadStore';
import EmptyState from './shared/EmptyState.jsx';
import '../styles/agenda-calendar-week.css';

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

const WEEKDAY_SHORT = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

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

    const openLeadFromCard = (lead) => {
        if (typeof onOpenLead === 'function') onOpenLead(lead);
    };

    const handleCardKeyDown = (event, lead) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openLeadFromCard(lead);
        }
    };

    return (
        <div className="agenda-hoje">
            {!hideNav ? (
                <div className="agenda-hoje__nav">
                    <button type="button" className="agenda-hoje__nav-btn" onClick={() => setWeekOffset((o) => o - 1)}>
                        ‹
                    </button>
                    <button type="button" className="agenda-hoje__nav-btn" onClick={() => setWeekOffset((o) => o + 1)}>
                        ›
                    </button>
                </div>
            ) : null}

            <div ref={weekScrollRef} className="agenda-hoje__scroll">
                {!weekHasAny ? (
                    <EmptyState
                        variant="compact"
                        tone="dashed"
                        icon={Calendar}
                        title="Nenhum agendamento nesta semana."
                        role="status"
                        className="agenda-hoje__empty"
                    />
                ) : (
                    <div className={`agenda-hoje__grid${hideSunday ? ' agenda-hoje__grid--six' : ''}`}>
                        {orderedDayDates.map((dayDate) => {
                            const key = ymdOf(dayDate);
                            const colLeads = weekLeadsByYmd[key] || [];
                            const isToday = key === todayYmd;
                            const dow = WEEKDAY_SHORT[(dayDate.getDay() + 6) % 7];
                            const dayNum = dayDate.getDate();

                            return (
                                <div
                                    key={key}
                                    ref={isToday ? todayColRef : null}
                                    className={`day-col${isToday ? ' today' : ''}`}
                                >
                                    <div className="day-col-head">
                                        <span className="day-dow">{dow}</span>
                                        <span className={`day-num${isToday ? ' active' : ''}`}>{dayNum}</span>
                                    </div>
                                    <div className="day-col-body">
                                        {colLeads.length === 0 ? (
                                            <div className="day-empty">sem aulas</div>
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
                                            const dotClass =
                                                slotStatus === 'attended'
                                                    ? 'aula-dot aula-dot--attended'
                                                    : slotStatus === 'missed'
                                                      ? 'aula-dot aula-dot--missed'
                                                      : slotStatus === 'pending'
                                                        ? 'aula-dot aula-dot--pending'
                                                        : 'aula-dot dot-green';

                                            return (
                                                <div
                                                    key={lead.id}
                                                    className={`aula-card${
                                                        attendedSelected ? ' aula-card--attended' : ''
                                                    }${missedSelected ? ' aula-card--missed' : ''}`}
                                                    title={tooltip}
                                                    role="button"
                                                    tabIndex={0}
                                                    onClick={() => openLeadFromCard(lead)}
                                                    onKeyDown={(e) => handleCardKeyDown(e, lead)}
                                                >
                                                    <div className="aula-card-top">
                                                        <span className={dotClass} aria-hidden />
                                                        <span className="aula-time">
                                                            {lead.scheduledTime && String(lead.scheduledTime).trim()
                                                                ? lead.scheduledTime
                                                                : '—:—'}
                                                        </span>
                                                    </div>
                                                    <div className="aula-name">{lead.name}</div>
                                                    {modality ? <div className="aula-tipo">{modality}</div> : null}
                                                    {showPresence ? (
                                                        <div className="aula-btns">
                                                            {typeof onCompareceu === 'function' ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn-veio"
                                                                    disabled={busyAttended || busyMissed}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onCompareceu(lead);
                                                                    }}
                                                                >
                                                                    {busyAttended ? '…' : '✓ Veio'}
                                                                </button>
                                                            ) : null}
                                                            {typeof onNaoCompareceu === 'function' ? (
                                                                <button
                                                                    type="button"
                                                                    className="btn-faltou"
                                                                    disabled={busyAttended || busyMissed}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onNaoCompareceu(lead);
                                                                    }}
                                                                >
                                                                    {busyMissed ? '…' : '✗ Faltou'}
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
</div>
    );
}
