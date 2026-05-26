import { useEffect, useState } from 'react';

/**
 * Keyboard overlap offset for fixed/sticky modal footers (iOS/Android visualViewport).
 * @param {boolean} enabled — typically `isMobile && modalOpen`
 */
export default function useVisualViewportKeyboardOffset(enabled) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      setKeyboardOffset(0);
      return undefined;
    }
    const vv = window.visualViewport;
    const upd = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setKeyboardOffset(offset);
    };
    upd();
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    return () => {
      vv.removeEventListener('resize', upd);
      vv.removeEventListener('scroll', upd);
    };
  }, [enabled]);

  return keyboardOffset;
}
