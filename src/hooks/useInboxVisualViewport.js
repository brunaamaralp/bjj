import { useEffect, useState } from 'react';

/**
 * Ajusta inset do teclado virtual (mobile) e altura máxima do popup de slash templates.
 */
export function useInboxVisualViewport(isMobile) {
  const [inboxVvInset, setInboxVvInset] = useState(0);
  const [inboxSlashMaxHeight, setInboxSlashMaxHeight] = useState(288);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;
    if (!isMobile) {
      setInboxVvInset(0);
      setInboxSlashMaxHeight(288);
      return;
    }
    const vv = window.visualViewport;
    const upd = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      setInboxVvInset(inset);
      setInboxSlashMaxHeight(Math.min(288, Math.max(120, Math.floor(vv.height * 0.38))));
    };
    upd();
    vv.addEventListener('resize', upd);
    vv.addEventListener('scroll', upd);
    return () => {
      vv.removeEventListener('resize', upd);
      vv.removeEventListener('scroll', upd);
    };
  }, [isMobile]);

  return { inboxVvInset, inboxSlashMaxHeight };
}
