import { useEffect, useRef, useState } from 'react';

const COMPOSER_EXPANDED_STORAGE_KEY = 'nave_composer_expanded';

/**
 * Estado e efeitos do composer (emoji, templates, slash commands, expand).
 */
export function useInboxComposerUi({ selectedPhone }) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashQuery, setSlashQuery] = useState('');
  const [slashIndex, setSlashIndex] = useState(0);
  const [composerExpanded, setComposerExpandedState] = useState(false);
  const [boundPhone, setBoundPhone] = useState(selectedPhone);

  const textareaRef = useRef(null);
  const slashPopupRef = useRef(null);
  const slashActiveItemRef = useRef(null);

  if (selectedPhone !== boundPhone) {
    setBoundPhone(selectedPhone);
    setSlashOpen(false);
    setSlashQuery('');
    setSlashIndex(0);
  }

  const setSlashQuerySafe = (value) => {
    setSlashQuery(value);
    setSlashIndex(0);
  };

  const setComposerExpanded = (value) => {
    const next = typeof value === 'function' ? value(composerExpanded) : value;
    setComposerExpandedState(next);
    if (!next) {
      setTemplatesOpen(false);
      setEmojiOpen(false);
    }
  };

  useEffect(() => {
    if (!slashOpen) return;
    const onDown = (e) => {
      const pop = slashPopupRef.current;
      const ta = textareaRef.current;
      const t = e.target;
      if (pop && pop.contains(t)) return;
      if (ta && ta.contains(t)) return;
      setSlashOpen(false);
      setSlashQuery('');
      setSlashIndex(0);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [slashOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem(COMPOSER_EXPANDED_STORAGE_KEY, composerExpanded ? '1' : '0');
    } catch {
      void 0;
    }
  }, [composerExpanded]);

  return {
    emojiOpen,
    setEmojiOpen,
    templatesOpen,
    setTemplatesOpen,
    slashOpen,
    setSlashOpen,
    slashQuery,
    setSlashQuery: setSlashQuerySafe,
    slashIndex,
    setSlashIndex,
    composerExpanded,
    setComposerExpanded,
    textareaRef,
    slashPopupRef,
    slashActiveItemRef,
  };
}
