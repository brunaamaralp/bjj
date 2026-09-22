import '../../styles/quick-note.css';
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import QuickNoteModal from './QuickNoteModal.jsx';

const MOBILE_BP = 1024;

function useIsMobileViewport() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia(`(max-width: ${MOBILE_BP - 1}px)`);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

export default function QuickNoteShortcut({ academyId }) {
  const location = useLocation();
  const isMobile = useIsMobileViewport();
  const [open, setOpen] = useState(false);

  const hideOnRoute = useMemo(() => {
    if (location.pathname.startsWith('/inbox')) return true;
    if (/^\/lead\/[^/]+/.test(location.pathname)) return true;
    if (/^\/student\/[^/]+/.test(location.pathname)) return true;
    return false;
  }, [location.pathname]);

  if (isMobile || hideOnRoute) return null;
  if (typeof document === 'undefined') return null;
  if (!academyId) return null;

  return createPortal(
    <>
      <div className="navi-quick-note">
        <button
          type="button"
          className="navi-quick-note__fab"
          onClick={() => setOpen(true)}
          aria-label="Nota rápida"
        >
          <Plus size={24} strokeWidth={2.25} aria-hidden />
        </button>
      </div>
      <QuickNoteModal open={open} onClose={() => setOpen(false)} academyId={academyId} />
    </>,
    document.body
  );
}
