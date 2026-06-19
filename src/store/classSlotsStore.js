import { create } from 'zustand';
import { createSessionJwt } from '../lib/appwrite.js';
import { authedFetch } from '../lib/authInterceptor.js';
import { friendlyError } from '../lib/errorMessages.js';
import { useLeadStore } from './useLeadStore.js';

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
  fetchedAcademyId: null,

  fetchSlotsForDate: async (academyId, dateYmd, opts = {}) => {
    const aid = String(academyId || '').trim();
    const date = String(dateYmd || '').trim();
    if (!aid || !date) return [];

    const { fetchedDate, fetchedAcademyId } = get();
    if (!opts.force && fetchedDate === date && fetchedAcademyId === aid) {
      return get().slots;
    }

    if (!opts.silent) set({ loading: true, error: null });
    try {
      const url = `/api/leads?route=bookings&action=list-slots&date=${encodeURIComponent(date)}&limit=100`;
      const data = await slotsFetch(url, {}, aid);
      const slots = sortSlots(data.slots || []);
      set({ slots, loading: false, error: null, fetchedDate: date, fetchedAcademyId: aid });
      return slots;
    } catch (e) {
      console.error('[classSlotsStore] fetchSlotsForDate:', e);
      set({ loading: false, error: friendlyError(e, 'load') });
      return [];
    }
  },

  patchSlot: (slotId, patch) => {
    set((state) => ({
      slots: state.slots.map((s) =>
        s.id === slotId ? { ...s, ...patch } : s
      ),
    }));
  },

  invalidate: () => {
    set({ fetchedDate: null, fetchedAcademyId: null });
  },
}));
