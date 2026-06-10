import { useSyncExternalStore } from 'react';

function getKeyboardOffset() {
  if (typeof window === 'undefined' || !window.visualViewport) return 0;
  const vv = window.visualViewport;
  return Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
}

function subscribeKeyboardOffset(callback) {
  if (typeof window === 'undefined' || !window.visualViewport) return () => {};
  const vv = window.visualViewport;
  vv.addEventListener('resize', callback);
  vv.addEventListener('scroll', callback);
  return () => {
    vv.removeEventListener('resize', callback);
    vv.removeEventListener('scroll', callback);
  };
}

/**
 * Keyboard overlap offset for fixed/sticky modal footers (iOS/Android visualViewport).
 * @param {boolean} enabled — typically `isMobile && modalOpen`
 */
export default function useVisualViewportKeyboardOffset(enabled) {
  return useSyncExternalStore(
    enabled ? subscribeKeyboardOffset : () => () => {},
    () => (enabled ? getKeyboardOffset() : 0),
    () => 0
  );
}
