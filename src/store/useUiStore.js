import { create } from 'zustand';

/** Durações padrão (ms) por tipo — erros ficam mais tempo no ecrã. */
export const TOAST_DURATION = {
  success: 3000,
  info: 4000,
  warning: 5000,
  error: 7000
};

const MAX_TOASTS = 3;

const timers = new Map();
const deadlines = new Map();
const pauseRemaining = new Map();

function clearToastScheduler(id) {
  const sid = String(id);
  const t = timers.get(sid);
  if (t) clearTimeout(t);
  timers.delete(sid);
  deadlines.delete(sid);
}

function dropToastsNotInKept(prev, kept) {
  const keptIds = new Set(kept.map((x) => String(x.id)));
  for (const t of prev) {
    if (!keptIds.has(String(t.id))) {
      clearToastScheduler(t.id);
      pauseRemaining.delete(String(t.id));
    }
  }
}

export const useUiStore = create((set, get) => ({
  toasts: [],

  addToast: (toast) => {
    const type = toast.type || 'info';
    const duration =
      typeof toast.duration === 'number' && toast.duration >= 0
        ? toast.duration
        : TOAST_DURATION[type] ?? TOAST_DURATION.info;
    const id =
      toast.id != null
        ? String(toast.id)
        : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    set((state) => {
      const prev = state.toasts;
      const kept = prev.length >= MAX_TOASTS ? prev.slice(-(MAX_TOASTS - 1)) : prev;
      if (kept.length < prev.length) dropToastsNotInKept(prev, kept);

      return {
        toasts: [
          ...kept,
          {
            id,
            type,
            message: toast.message || '',
            durationMs: duration,
            removing: false
          }
        ]
      };
    });

    const sid = String(id);
    const end = Date.now() + duration;
    deadlines.set(sid, end);
    const timeoutId = setTimeout(() => get().removeToast(sid), duration);
    timers.set(sid, timeoutId);
  },

  removeToast: (id) => {
    const sid = String(id);
    const current = get().toasts.find((t) => String(t.id) === sid);
    if (!current) return;
    if (current.removing) return;

    clearToastScheduler(sid);
    pauseRemaining.delete(sid);

    set((state) => ({
      toasts: state.toasts.map((t) => (String(t.id) === sid ? { ...t, removing: true } : t))
    }));

    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => String(t.id) !== sid)
      }));
    }, 200);
  },

  pauseToast: (id) => {
    const sid = String(id);
    const tid = timers.get(sid);
    if (tid) clearTimeout(tid);
    timers.delete(sid);
    const end = deadlines.get(sid);
    if (end != null) {
      pauseRemaining.set(sid, Math.max(0, end - Date.now()));
      deadlines.delete(sid);
    }
  },

  resumeToast: (id) => {
    const sid = String(id);
    const rem = pauseRemaining.get(sid);
    pauseRemaining.delete(sid);
    if (rem == null) return;
    if (rem <= 0) {
      get().removeToast(sid);
      return;
    }
    const end = Date.now() + rem;
    deadlines.set(sid, end);
    const timeoutId = setTimeout(() => get().removeToast(sid), rem);
    timers.set(sid, timeoutId);
  }
}));
