import '../../styles/slots.css';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, Users, CheckCircle2, X, ChevronDown, ChevronRight, UserPlus, Loader2,
} from 'lucide-react';
import ReportSectionHeading from '../reports/shared/ReportSectionHeading.jsx';
import { useClassSlotsStore } from '../../store/classSlotsStore.js';
import { useBookingsStore } from '../../store/bookingsStore.js';
import { useUiStore } from '../../store/useUiStore.js';
import { searchStudentsForSale } from '../../lib/studentSaleSearch.js';

function todayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function fmtTime(hhmm) {
  return String(hhmm || '').slice(0, 5);
}

function statusBadge(status) {
  if (status === 'checked_in') return { label: 'Presente', cls: 'booking-status--checkin' };
  if (status === 'cancelled') return { label: 'Cancelado', cls: 'booking-status--cancelled' };
  if (status === 'no_show') return { label: 'Falta', cls: 'booking-status--noshow' };
  return { label: 'Inscrito', cls: 'booking-status--booked' };
}

function StudentSearchDropdown({ academyId, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef(null);

  /* Fechar ao clicar fora */
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    if (!academyId || query.trim().length < 2) {
      setResults([]);
      setBusy(false);
      return;
    }
    const q = query.trim();
    let cancelled = false;
    setBusy(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await searchStudentsForSale(academyId, q, { limit: 10 });
        if (!cancelled) setResults(hits.filter(Boolean));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setBusy(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [academyId, query]);

  return (
    <div className="slot-student-search" ref={containerRef}>
      <div className="slot-student-search__field">
        <input
          autoFocus
          type="text"
          className="input"
          placeholder="Buscar aluno pelo nome ou telefone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Buscar aluno"
        />
        <button type="button" className="btn-ghost btn-icon" onClick={onClose} aria-label="Fechar busca">
          <X size={16} />
        </button>
      </div>
      {busy ? (
        <div className="slot-student-search__loading">
          <Loader2 size={16} className="spin" aria-hidden />
          <span>Buscando…</span>
        </div>
      ) : results.length > 0 ? (
        <ul className="slot-student-search__list" role="listbox">
          {results.map((s) => (
            <li key={s.$id || s.id} role="option">
              <button
                type="button"
                className="slot-student-search__item"
                onClick={() => onSelect(s)}
              >
                <span className="slot-student-search__name">{s.name || s.nome || '—'}</span>
                {(s.phone || s.phone_number) ? (
                  <span className="slot-student-search__phone text-small text-muted">
                    {s.phone || s.phone_number}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 ? (
        <p className="slot-student-search__empty text-small text-muted">Nenhum aluno encontrado.</p>
      ) : null}
    </div>
  );
}

function SlotBookingRow({ booking, slotId, academyId, isMutating, onCheckin, onCancel }) {
  const badge = statusBadge(booking.status);
  const busy = isMutating(booking.id);
  return (
    <li className="slot-booking-row">
      <span className="slot-booking-row__name">{booking.student_name || '—'}</span>
      <span className={`slot-booking-status ${badge.cls}`}>{badge.label}</span>
      <div className="slot-booking-row__actions">
        {booking.status === 'booked' ? (
          <>
            <button
              type="button"
              className="btn-ghost btn-icon slot-booking-row__btn"
              title="Confirmar presença"
              disabled={busy}
              onClick={() => onCheckin(booking.id, slotId)}
              aria-label={`Confirmar presença de ${booking.student_name}`}
            >
              {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
            </button>
            <button
              type="button"
              className="btn-ghost btn-icon slot-booking-row__btn slot-booking-row__btn--cancel"
              title="Cancelar inscrição"
              disabled={busy}
              onClick={() => onCancel(booking.id, slotId)}
              aria-label={`Cancelar inscrição de ${booking.student_name}`}
            >
              <X size={14} />
            </button>
          </>
        ) : null}
        {booking.status === 'checked_in' ? (
          <CheckCircle2 size={14} color="var(--color-success)" aria-label="Presente" />
        ) : null}
      </div>
    </li>
  );
}

function SlotCard({ slot, academyId }) {
  const [expanded, setExpanded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const bookings = useBookingsStore((s) => s.bookingsBySlot[slot.id] || null);
  const loadingSlots = useBookingsStore((s) => s.loadingSlots);
  /* Subscreve ao array para re-renderizar quando muda */
  const mutatingIds = useBookingsStore((s) => s.mutatingIds);
  const isMutating = useCallback(
    (id) => mutatingIds.includes(String(id || '')),
    [mutatingIds],
  );

  const fetchBookingsForSlot = useBookingsStore((s) => s.fetchBookingsForSlot);
  const createBooking = useBookingsStore((s) => s.createBooking);
  const cancelBooking = useBookingsStore((s) => s.cancelBooking);
  const checkinBooking = useBookingsStore((s) => s.checkinBooking);
  const patchSlot = useClassSlotsStore((s) => s.patchSlot);
  const addToast = useUiStore((s) => s.addToast);

  const isLoadingBookings = Boolean(loadingSlots[slot.id]);
  const isEnrolling = isMutating(slot.id);

  const handleExpand = useCallback(async () => {
    const next = !expanded;
    setExpanded(next);
    if (next && bookings === null) {
      try {
        await fetchBookingsForSlot(slot.id, academyId);
      } catch (e) {
        addToast({ type: 'error', message: e.message || 'Erro ao carregar inscrições' });
      }
    }
  }, [expanded, bookings, slot.id, academyId, fetchBookingsForSlot, addToast]);

  const handleCheckin = useCallback(async (bookingId) => {
    try {
      const res = await checkinBooking(bookingId, slot.id, academyId);
      if (res?.slot) {
        patchSlot(slot.id, { booked_count: res.slot.booked_count, checked_in_count: res.slot.checked_in_count });
      }
      addToast({ type: 'success', message: 'Presença confirmada!' });
    } catch (e) {
      addToast({ type: 'error', message: e.message || 'Erro ao confirmar presença' });
    }
  }, [checkinBooking, slot.id, academyId, patchSlot, addToast]);

  const handleCancel = useCallback(async (bookingId) => {
    try {
      const res = await cancelBooking(bookingId, slot.id, academyId);
      if (res?.slot) {
        patchSlot(slot.id, { booked_count: res.slot.booked_count });
      } else {
        patchSlot(slot.id, { booked_count: Math.max(0, (slot.booked_count || 0) - 1) });
      }
      addToast({ type: 'success', message: 'Inscrição cancelada.' });
    } catch (e) {
      addToast({ type: 'error', message: e.message || 'Erro ao cancelar inscrição' });
    }
  }, [cancelBooking, slot.id, academyId, patchSlot, slot.booked_count, addToast]);

  const handleSelectStudent = useCallback(async (student) => {
    const studentId = String(student.$id || student.id || '').trim();
    const studentName = String(student.name || student.nome || '').trim();
    if (!studentId) return;
    setShowSearch(false);
    try {
      await createBooking(slot.id, studentId, academyId);
      patchSlot(slot.id, { booked_count: (slot.booked_count || 0) + 1 });
      if (!expanded) setExpanded(true);
      if (bookings === null) {
        await fetchBookingsForSlot(slot.id, academyId);
      }
      addToast({ type: 'success', message: `${studentName || 'Aluno'} inscrito na aula.` });
    } catch (e) {
      addToast({ type: 'error', message: e.message || 'Erro ao inscrever aluno' });
    }
  }, [slot.id, slot.booked_count, academyId, expanded, bookings, createBooking, patchSlot, fetchBookingsForSlot, addToast]);

  const activeBookings = (bookings || []).filter((b) => b.status !== 'cancelled' && b.status !== 'no_show');
  const isFull = slot.max_capacity != null && (slot.booked_count || 0) >= slot.max_capacity;

  const capacityLabel = slot.max_capacity == null
    ? `${slot.booked_count ?? 0} inscritos`
    : `${slot.booked_count ?? 0} / ${slot.max_capacity}`;

  return (
    <div className={`slot-card card${isFull ? ' slot-card--full' : ''}`}>
      <div className="slot-card__head">
        <div className="slot-card__info">
          <span className="slot-card__time text-small text-muted">
            {fmtTime(slot.time_start)}–{fmtTime(slot.time_end)}
          </span>
          <span className="slot-card__name">{slot.name}</span>
          {slot.instructor ? (
            <span className="slot-card__instructor text-small text-muted">{slot.instructor}</span>
          ) : null}
        </div>
        <div className="slot-card__meta">
          <span className={`slot-card__capacity text-small${isFull ? ' slot-card__capacity--full' : ' text-muted'}`}>
            <Users size={13} strokeWidth={2} aria-hidden />
            {capacityLabel}
          </span>
          <button
            type="button"
            className="btn-ghost btn-icon slot-card__expand"
            onClick={handleExpand}
            aria-expanded={expanded}
            aria-label={expanded ? 'Recolher inscrições' : 'Ver inscrições'}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>
      </div>

      {expanded ? (
        <div className="slot-card__body">
          {isLoadingBookings ? (
            <p className="text-small text-muted slot-card__loading">
              <Loader2 size={14} className="spin" aria-hidden /> Carregando…
            </p>
          ) : (
            <>
              {activeBookings.length > 0 ? (
                <ul className="slot-bookings-list" aria-label="Inscritos">
                  {activeBookings.map((b) => (
                    <SlotBookingRow
                      key={b.id}
                      booking={b}
                      slotId={slot.id}
                      academyId={academyId}
                      isMutating={isMutating}
                      onCheckin={handleCheckin}
                      onCancel={handleCancel}
                    />
                  ))}
                </ul>
              ) : (
                <p className="text-small text-muted slot-card__empty">Nenhum aluno inscrito ainda.</p>
              )}

              {showSearch ? (
                <StudentSearchDropdown
                  academyId={academyId}
                  onSelect={handleSelectStudent}
                  onClose={() => setShowSearch(false)}
                />
              ) : !isFull ? (
                <button
                  type="button"
                  className="btn-ghost slot-card__enroll-btn"
                  onClick={() => setShowSearch(true)}
                  disabled={isEnrolling}
                  title="Inscrever aluno"
                >
                  {isEnrolling
                    ? <Loader2 size={14} className="spin" aria-hidden />
                    : <UserPlus size={14} strokeWidth={2} aria-hidden />}
                  {isEnrolling ? 'Inscrevendo…' : 'Inscrever aluno'}
                </button>
              ) : (
                <p className="text-small text-muted slot-card__full-note">Aula lotada — vagas esgotadas.</p>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function RecepcaoTodaySlotsSection({ academyId }) {
  const slots = useClassSlotsStore((s) => s.slots);
  const loading = useClassSlotsStore((s) => s.loading);
  const error = useClassSlotsStore((s) => s.error);
  const fetchSlotsForDate = useClassSlotsStore((s) => s.fetchSlotsForDate);

  const today = todayYmd();

  useEffect(() => {
    if (!academyId) return;
    void fetchSlotsForDate(academyId, today, { silent: false });
  }, [academyId, today, fetchSlotsForDate]);

  if (!academyId) return null;

  return (
    <section className="reception-section slots-today-section animate-in" aria-labelledby="slots-today-title">
      <div className="slots-today-section__head">
        <ReportSectionHeading
          id="slots-today-title"
          className="reception-report-heading"
          title={
            <>
              <CalendarDays size={18} color="var(--color-primary)" strokeWidth={2} aria-hidden />
              Aulas de hoje
            </>
          }
        />
        {!loading && slots.length > 0 ? (
          <span className="badge badge-secondary">{slots.length} {slots.length === 1 ? 'aula' : 'aulas'}</span>
        ) : null}
      </div>

      {loading ? (
        <p className="text-small text-muted slots-today-status" role="status">
          <Loader2 size={14} className="spin" aria-hidden /> Carregando aulas…
        </p>
      ) : error ? (
        <p className="text-small text-muted slots-today-status" role="alert">{error}</p>
      ) : slots.length === 0 ? (
        <div className="slots-today-empty card">
          <p className="text-small text-muted">
            Nenhuma aula agendada para hoje. Configure os horários em{' '}
            <Link to="/empresa?tab=horarios" className="edit-link">Minha academia → Horários</Link>.
          </p>
        </div>
      ) : (
        <div className="slots-today-list">
          {slots.map((slot) => (
            <SlotCard key={slot.id} slot={slot} academyId={academyId} />
          ))}
        </div>
      )}
    </section>
  );
}
