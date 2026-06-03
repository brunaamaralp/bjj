import useMediaQuery from './useMediaQuery.js';

/** Breakpoints usados na tela Conversas. */
export function useInboxViewport() {
  const isMobile = useMediaQuery('(max-width: 1023px)');
  const isNarrowDesktop = useMediaQuery('(max-width: 1365px)');
  const inboxThreadNarrow767 = useMediaQuery('(max-width: 767px)');
  const showInboxKeyHints = useMediaQuery('(min-width: 769px)');
  return { isMobile, isNarrowDesktop, inboxThreadNarrow767, showInboxKeyHints };
}
