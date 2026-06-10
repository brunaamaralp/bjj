import { useEffect, useState } from 'react';

function readInboxViewport(width) {
  return {
    isMobile: width <= 1023,
    isNarrowDesktop: width <= 1365,
    inboxThreadNarrow767: width <= 767,
    showInboxKeyHints: width >= 769,
  };
}

function readWidth() {
  if (typeof window === 'undefined') return 1280;
  return window.innerWidth;
}

/** Breakpoints usados na tela Conversas — um único listener debounced. */
export function useInboxViewport() {
  const [viewport, setViewport] = useState(() => readInboxViewport(readWidth()));

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let debounceId = null;
    const sync = () => {
      setViewport(readInboxViewport(window.innerWidth));
    };
    const onResize = () => {
      if (debounceId != null) clearTimeout(debounceId);
      debounceId = setTimeout(sync, 100);
    };

    sync();
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      if (debounceId != null) clearTimeout(debounceId);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return viewport;
}
