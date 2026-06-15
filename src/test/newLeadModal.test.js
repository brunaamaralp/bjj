import { describe, expect, it, beforeEach, vi } from 'vitest';
import { useUiStore } from '../store/useUiStore.js';
import {
  dispatchOpenNewLeadModal,
  OPEN_NEW_LEAD_MODAL_EVENT,
  preloadNewLeadModalChunk,
} from '../lib/newLeadModal.js';

vi.mock('../components/leads/NewLeadModal.jsx', () => ({
  default: () => null,
}));

describe('newLeadModal', () => {
  beforeEach(() => {
    useUiStore.setState({ newLeadModalOpen: false });
  });

  it('opens modal via ui store and dispatches legacy event', () => {
    const handler = vi.fn();
    window.addEventListener(OPEN_NEW_LEAD_MODAL_EVENT, handler);

    dispatchOpenNewLeadModal();

    expect(useUiStore.getState().newLeadModalOpen).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);

    window.removeEventListener(OPEN_NEW_LEAD_MODAL_EVENT, handler);
  });

  it('preloads modal chunk without throwing', async () => {
    await expect(preloadNewLeadModalChunk()).resolves.toBeTruthy();
  });
});
