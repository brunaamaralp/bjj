import { create } from 'zustand';
import { createSessionJwt, CLASS_SLOTS_COL } from '../lib/appwrite.js';
import { authedFetch } from '../lib/authInterceptor.js';
import { friendlyError } from '../lib/errorMessages.js';
import { useLeadStore } from './useLeadStore.js';

export function isClassSlotsConfigured() {
  return Boolean(String(CLASS_SLOTS_COL || '').trim());
}

async function slotsFetch(path, options = {}, academyIdOverride = '') {
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

function sortSlots(list) {
  return [...(list || [])].sort((a, b) =>
    String(a.time_start || '').localeCompare(String(b.time_start || ''))
  );
}

export const useClassSlotsStore = create((set, get) => ({
  slots: [],
  loading: false,
  error: null,
  fetchedDate: null,
  fetchedFrom: null,
  fetchedTo: null,
  fetchedAcademyId: null,

  fetchSlotsForDate: async (academyId, dateYmd, opts = {}) => {
    const aid = String(academyId || '').trim();
    const date = String(dateYmd || '').trim();
    if (!aid || !date) return [];

    const { fetchedDate, fetchedFrom, fetchedTo, fetchedAcademyId } = get();
    if (
      !opts.force &&
      fetchedAcademyId === aid &&
      (fetchedDate === date || (fetchedFrom && fetchedTo && date >= fetchedFrom && date <= fetchedTo))
    ) {
      return get().slots.filter((s) => String(s.slot_date || '') === date);
    }

    if (!opts.silent) set({ loading: true, error: null });
    try {
      const url = `/api/leads?route=bookings&action=list-slots&date=${encodeURIComponent(date)}&limit=100`;
      const data = await slotsFetch(url, {}, aid);
      const slots = sortSlots(data.slots || []);
      set({
        slots,
        loading: false,
        error: null,
        fetchedDate: date,
        fetchedFrom: date,
        fetchedTo: date,
        fetchedAcademyId: aid,
      });
      return slots;
    } catch (e) {
      console.error('[classSlotsStore] fetchSlotsForDate:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      return [];
    }
  },

  fetchSlotsForRange: async (academyId, fromYmd, toYmd, opts = {}) => {
    const aid = String(academyId || '').trim();
    const from = String(fromYmd || '').trim();
    const to = String(toYmd || '').trim();
    if (!aid || !from || !to) return [];

    const { fetchedFrom, fetchedTo, fetchedAcademyId } = get();
    if (!opts.force && fetchedAcademyId === aid && fetchedFrom === from && fetchedTo === to) {
      return get().slots;
    }

    if (!opts.silent) set({ loading: true, error: null });
    try {
      const fromIso = `${from}T00:00:00.000-03:00`;
      const toIso = `${to}T23:59:59.999-03:00`;
      const url =
        `/api/leads?route=bookings&action=list-slots` +
        `&from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}&limit=200`;
      const data = await slotsFetch(url, {}, aid);
      const slots = sortSlots(data.slots || []);
      set({
        slots,
        loading: false,
        error: null,
        fetchedDate: null,
        fetchedFrom: from,
        fetchedTo: to,
        fetchedAcademyId: aid,
      });
      return slots;
    } catch (e) {
      console.error('[classSlotsStore] fetchSlotsForRange:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      return [];
    }
  },

  patchSlot: (slotId, patch) => {
    set((state) => {
      const id = String(slotId || '').trim();
      if (!id) return state;
      const exists = state.slots.some((s) => s.id === id);
      if (exists) {
        return {
          slots: state.slots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        };
      }
      if (patch?.id || patch?.schedule_id) {
        return { slots: sortSlots([...state.slots, { id, ...patch }]) };
      }
      return state;
    });
  },

  upsertSlot: (slot) => {
    if (!slot?.id) return;
    set((state) => {
      const exists = state.slots.some((s) => s.id === slot.id);
      if (exists) {
        return {
          slots: state.slots.map((s) => (s.id === slot.id ? { ...s, ...slot } : s)),
        };
      }
      return { slots: sortSlots([...state.slots, slot]) };
    });
  },

  invalidate: () => {
    set({
      fetchedDate: null,
      fetchedFrom: null,
      fetchedTo: null,
      fetchedAcademyId: null,
    });
  },
}));
