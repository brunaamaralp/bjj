import { create } from 'zustand';

const EMPTY_OVERRIDES = {
  context: null,
  pipelineStages: [],
  pendingTransactions: [],
  recentPayments: [],
};

/** @typedef {typeof EMPTY_OVERRIDES} NlPageOverrides */

export const useNlCommandStore = create((set) => ({
  pageOverrides: { ...EMPTY_OVERRIDES },

  setPageOverrides: (overrides) => {
    const next = overrides && typeof overrides === 'object' ? overrides : {};
    set({
      pageOverrides: {
        context: next.context ?? null,
        pipelineStages: Array.isArray(next.pipelineStages) ? next.pipelineStages : [],
        pendingTransactions: Array.isArray(next.pendingTransactions)
          ? next.pendingTransactions
          : [],
        recentPayments: Array.isArray(next.recentPayments) ? next.recentPayments : [],
      },
    });
  },

  clearPageOverrides: () => set({ pageOverrides: { ...EMPTY_OVERRIDES } }),
}));
