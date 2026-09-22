import { create } from 'zustand';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';

const STORAGE_KEY = 'navi-chat-widget';

function readPersisted() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

function writePersisted(state) {
  if (typeof window === 'undefined') return;
  try {
    if (!state.isPinned) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        academyId: state.academyId,
        isPinned: state.isPinned,
        isOpen: state.isOpen,
        activePhone: state.activePhone,
        leadId: state.leadId,
        leadName: state.leadName,
      })
    );
  } catch {
    void 0;
  }
}

const persisted = readPersisted();

const initialState = {
  academyId: String(persisted?.academyId || '').trim(),
  isOpen: Boolean(persisted?.isOpen),
  isPinned: Boolean(persisted?.isPinned && persisted?.activePhone),
  activePhone: primaryInboxPhone(persisted?.activePhone || ''),
  leadId: String(persisted?.leadId || '').trim(),
  leadName: String(persisted?.leadName || '').trim(),
};

export const useChatWidgetStore = create((set, get) => ({
  ...initialState,

  pinConversation: ({ phone, leadId = '', leadName = '', academyId = '', openPanel = true } = {}) => {
    const p = primaryInboxPhone(phone);
    if (!p) return;
    const aid = String(academyId || get().academyId || '').trim();
    const next = {
      academyId: aid,
      isPinned: true,
      isOpen: openPanel !== false,
      activePhone: p,
      leadId: String(leadId || '').trim(),
      leadName: String(leadName || '').trim(),
    };
    set(next);
    writePersisted({ ...get(), ...next });
  },

  openPanel: () => {
    if (!get().isPinned) return;
    set({ isOpen: true });
    writePersisted(get());
  },

  minimizePanel: () => {
    set({ isOpen: false });
    writePersisted(get());
  },

  closeWidget: () => {
    const next = {
      isOpen: false,
      isPinned: false,
      activePhone: '',
      leadId: '',
      leadName: '',
    };
    set(next);
    writePersisted({ ...get(), ...next });
  },

  switchConversation: ({ phone, leadId = '', leadName = '' } = {}) => {
    const p = primaryInboxPhone(phone);
    if (!p) return;
    const next = {
      isPinned: true,
      isOpen: true,
      activePhone: p,
      leadId: String(leadId || '').trim(),
      leadName: String(leadName || '').trim(),
    };
    set(next);
    writePersisted({ ...get(), ...next });
  },

  setLeadName: (leadName) => {
    const name = String(leadName || '').trim();
    if (!name || name === get().leadName) return;
    set({ leadName: name });
    writePersisted(get());
  },

  resetForAcademy: (academyId) => {
    const aid = String(academyId || '').trim();
    const cur = get();
    if (!aid) return;
    if (cur.academyId && cur.academyId !== aid) {
      const next = {
        academyId: aid,
        isOpen: false,
        isPinned: false,
        activePhone: '',
        leadId: '',
        leadName: '',
      };
      set(next);
      writePersisted({ ...get(), ...next });
      return;
    }
    if (cur.academyId !== aid) {
      set({ academyId: aid });
      writePersisted(get());
    }
  },
}));
