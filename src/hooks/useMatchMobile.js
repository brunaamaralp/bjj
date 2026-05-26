import { useEffect, useState } from 'react';

/** Mobile breakpoint: viewport width &lt; 768px (matches max-width: 767px). */
export default function useMatchMobile(maxWidthPx = 767) {
  const query = `(max-width: ${maxWidthPx}px)`;
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
