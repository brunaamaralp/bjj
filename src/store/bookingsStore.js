import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite.js';
import { authedFetch } from '../lib/authInterceptor.js';
import { useLeadStore } from './useLeadStore.js';

async function bookingsFetch(path, options = {}, academyIdOverride = '') {
  const jwt = await createSessionJwt();
  if (!jwt) throw new Error('session_required');
  const academyId = String(academyIdOverride || useLeadStore.getState().academyId || '').trim();
  if (!academyId) throw new Error('academy_required');
  const res = await authedFetch(path, {
    ...options,
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'x-academy-id': academyId,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.sucesso === false) {
    throw new Error(data.erro || data.error || `error_${res.status}`);
  }
  return data;
}

export const useBookingsStore = create((set, get) => ({
  bookingsBySlot: {},
  loadingSlots: {},
  mutatingIds: [],

  isMutating: (id) => get().mutatingIds.includes(String(id || '').trim()),

  _setMutating: (id, on) => {
    set((state) => ({
      mutatingIds: on
        ? [...state.mutatingIds, String(id || '')]
        : state.mutatingIds.filter((x) => x !== String(id || '')),
    }));
  },

  fetchBookingsForSlot: async (slotId, academyId, opts = {}) => {
    const sid = String(slotId || '').trim();
    const aid = String(academyId || '').trim();
    if (!sid || !aid) return [];

    if (!opts.silent) {
      set((state) => ({ loadingSlots: { ...state.loadingSlots, [sid]: true } }));
    }
    try {
      const url = `/api/leads?route=bookings&action=list-bookings&slot_id=${encodeURIComponent(sid)}`;
      const data = await bookingsFetch(url, {}, aid);
      const bookings = data.bookings || [];
      set((state) => ({
        bookingsBySlot: { ...state.bookingsBySlot, [sid]: bookings },
        loadingSlots: { ...state.loadingSlots, [sid]: false },
      }));
      return bookings;
    } catch (e) {
      console.error('[bookingsStore] fetchBookingsForSlot:', e);
      set((state) => ({ loadingSlots: { ...state.loadingSlots, [sid]: false } }));
      throw e;
    }
  },

  createBooking: async (slotId, studentId, academyId) => {
    const sid = String(slotId || '').trim();
    const stid = String(studentId || '').trim();
    if (!sid || !stid) throw new Error('slot_id e student_id são obrigatórios');

    get()._setMutating(sid, true);
    try {
      const url = '/api/leads?route=bookings&action=create';
      const data = await bookingsFetch(
        url,
        { method: 'POST', body: JSON.stringify({ slot_id: sid, student_id: stid }) },
        academyId
      );
      if (data.booking) {
        set((state) => {
          const existing = state.bookingsBySlot[sid] || [];
          return {
            bookingsBySlot: {
              ...state.bookingsBySlot,
              [sid]: [...existing, data.booking],
            },
          };
        });
      }
      return data;
    } finally {
      get()._setMutating(sid, false);
    }
  },

  cancelBooking: async (bookingId, slotId, academyId) => {
    const bid = String(bookingId || '').trim();
    const sid = String(slotId || '').trim();
    if (!bid) throw new Error('booking_id obrigatório');

    get()._setMutating(bid, true);
    try {
      const url = '/api/leads?route=bookings&action=cancel';
      const data = await bookingsFetch(
        url,
        { method: 'POST', body: JSON.stringify({ booking_id: bid }) },
        academyId
      );
      if (sid) {
        set((state) => ({
          bookingsBySlot: {
            ...state.bookingsBySlot,
            [sid]: (state.bookingsBySlot[sid] || []).filter((b) => b.id !== bid),
          },
        }));
      }
      return data;
    } finally {
      get()._setMutating(bid, false);
    }
  },

  checkinBooking: async (bookingId, slotId, academyId) => {
    const bid = String(bookingId || '').trim();
    const sid = String(slotId || '').trim();
    if (!bid) throw new Error('booking_id obrigatório');

    get()._setMutating(bid, true);
    try {
      const url = '/api/leads?route=bookings&action=checkin';
      const data = await bookingsFetch(
        url,
        { method: 'POST', body: JSON.stringify({ booking_id: bid }) },
        academyId
      );
      if (sid && data.booking) {
        set((state) => ({
          bookingsBySlot: {
            ...state.bookingsBySlot,
            [sid]: (state.bookingsBySlot[sid] || []).map((b) =>
              b.id === bid ? { ...b, ...data.booking } : b
            ),
          },
        }));
      }
      return data;
    } finally {
      get()._setMutating(bid, false);
    }
  },

  clearSlot: (slotId) => {
    const sid = String(slotId || '').trim();
    set((state) => {
      const next = { ...state.bookingsBySlot };
      delete next[sid];
      return { bookingsBySlot: next };
    });
  },
}));
