import { useEffect, useState } from 'react';

/** Retorna `value` após `delayMs` sem mudanças (padrão 200ms). */
export default function useDebounce(value, delayMs = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
