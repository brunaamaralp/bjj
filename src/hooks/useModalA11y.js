import { useEffect } from 'react';

/**
 * Comportamento padrão de modal: Escape fecha e body scroll lock opcional.
 * @param {{ isOpen: boolean, onClose: () => void, lockScroll?: boolean }} options
 */
export function useModalA11y({ isOpen, onClose, lockScroll = true }) {
  useEffect(() => {
    if (!isOpen) return undefined;

    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKeyDown);

    if (lockScroll) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
        document.removeEventListener('keydown', handleKeyDown);
      };
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, lockScroll]);
}
