import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildReconciliationIndex,
  getExtratoHash,
  reconcileBatch,
  removeFromIndex,
} from '../lib/bankReconciliationClientMatcher.js';

const EMPTY_TX = [];

/**
 * Matching client-side de extrato ↔ lançamentos não conciliados.
 * @param {{ extratoItems: object[], unmatchedTx: object[], enabled?: boolean }} params
 */
export default function useBankReconciliationClientMatch({
  extratoItems,
  unmatchedTx = EMPTY_TX,
  enabled = true,
}) {
  const indexRef = useRef(buildReconciliationIndex([]));
  const [resultsByItemId, setResultsByItemId] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const runIdRef = useRef(0);

  const stableUnmatchedTx = unmatchedTx.length === 0 && unmatchedTx !== EMPTY_TX ? EMPTY_TX : unmatchedTx;

  const index = useMemo(() => {
    const built = buildReconciliationIndex(stableUnmatchedTx);
    indexRef.current = built;
    return built;
  }, [stableUnmatchedTx]);

  const extratoHash = useMemo(() => getExtratoHash(extratoItems), [extratoItems]);

  useEffect(() => {
    if (!enabled || !extratoItems?.length) {
      return;
    }

    const runId = ++runIdRef.current;
    setIsProcessing(true);
    setProgress({ processed: 0, total: extratoItems.length });

    void reconcileBatch(
      extratoItems,
      index,
      (processed, total) => {
        if (runId !== runIdRef.current) return;
        setProgress({ processed, total });
      },
      { cache: true, cacheKey: extratoHash }
    ).then((results) => {
      if (runId !== runIdRef.current) return;
      setResultsByItemId(results);
      setIsProcessing(false);
    });

    return () => {
      runIdRef.current += 1;
    };
  }, [enabled, extratoItems, index, extratoHash]);

  const removeTxFromIndex = useCallback((txId) => {
    removeFromIndex(indexRef.current, txId);
  }, []);

  return {
    resultsByItemId,
    isProcessing,
    progress,
    removeTxFromIndex,
    indexRef,
  };
}
