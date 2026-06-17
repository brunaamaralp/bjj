import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  readReconTourSeen,
  shouldShowReconTour,
  writeReconTourSeen,
} from '../lib/bankReconOnboarding.js';

export function useBankReconTour({ academyId, inDetail = false } = {}) {
  const [searchParams] = useSearchParams();
  const forceTour = searchParams.get('recon_tour') === '1';
  const [tourSeen, setTourSeen] = useState(() => readReconTourSeen(academyId));

  useEffect(() => {
    setTourSeen(readReconTourSeen(academyId));
  }, [academyId]);

  const showTour = useMemo(
    () => shouldShowReconTour({ inDetail, tourSeen: tourSeen && !forceTour, forceTour }),
    [inDetail, tourSeen, forceTour]
  );

  const completeTour = useCallback(() => {
    writeReconTourSeen(academyId);
    setTourSeen(true);
  }, [academyId]);

  return { showTour, completeTour };
}
