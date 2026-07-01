import { useEffect, useMemo, useRef, useState } from 'react';
import useDebounce from './useDebounce.js';
import {
  FINANCE_CATEGORY_SUGGESTION_DEBOUNCE_MS,
  FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD,
  buildCategoryIndex,
  suggestCategory,
} from '../lib/financeCategorySuggestion.js';

const scheduleIdle =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 120 })
    : (cb) => setTimeout(cb, 1);

const cancelIdle =
  typeof cancelIdleCallback === 'function' ? (id) => cancelIdleCallback(id) : (id) => clearTimeout(id);

/**
 * Sugestão de categoria com debounce, índice pré-computado, idle callback e cache de sessão.
 * @param {{ transactions: object[], direction: 'in'|'out', description: string, enabled?: boolean, threshold?: number }} params
 */
export default function useFinanceCategorySuggestion({
  transactions,
  direction,
  description,
  enabled = true,
  threshold = FINANCE_CATEGORY_SUGGESTION_DEFAULT_THRESHOLD,
}) {
  const cacheRef = useRef(new Map());
  const debouncedDescription = useDebounce(description, FINANCE_CATEGORY_SUGGESTION_DEBOUNCE_MS);
  const [suggestion, setSuggestion] = useState(null);

  const index = useMemo(
    () =>
      buildCategoryIndex(transactions, {
        direction: direction === 'out' ? 'out' : 'in',
      }),
    [transactions, direction]
  );

  useEffect(() => {
    cacheRef.current.clear();
  }, [index]);

  useEffect(() => {
    if (!enabled) {
      setSuggestion(null);
      return;
    }

    const trimmed = String(debouncedDescription || '').trim();
    if (!trimmed) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    const idleId = scheduleIdle(() => {
      if (cancelled) return;
      const result = suggestCategory(trimmed, {
        index,
        threshold,
        cache: cacheRef.current,
      });
      if (!cancelled) setSuggestion(result);
    });

    return () => {
      cancelled = true;
      cancelIdle(idleId);
    };
  }, [debouncedDescription, enabled, index, threshold]);

  return suggestion;
}
