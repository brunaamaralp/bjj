import { create } from 'zustand';

export const useUiStore = create((set) => ({
  toasts: [],
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        {
          id: toast.id || Date.now().toString(),
          type: toast.type || 'info',
          message: toast.message || '',
        },
      ],
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

