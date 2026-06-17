import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  clearReconWizardDismissed,
  computeReconWizardState,
  readReconTourSeen,
  readReconWizardDismissed,
  shouldShowReconTour,
  writeReconTourSeen,
  writeReconWizardDismissed,
} from '../lib/bankReconOnboarding.js';

export function useBankReconWizard({ academyId, statementsCount = 0, inDetail = false, hasImported = false } = {}) {
  const [searchParams] = useSearchParams();
  const forceWizard = searchParams.get('recon_wizard') === '1';
  const forceTour = searchParams.get('recon_tour') === '1';

  const [wizardDismissed, setWizardDismissed] = useState(() => readReconWizardDismissed(academyId));
  const [tourSeen, setTourSeen] = useState(() => readReconTourSeen(academyId));
  const [wizardStepIndex, setWizardStepIndex] = useState(0);

  useEffect(() => {
    setWizardDismissed(readReconWizardDismissed(academyId));
    setTourSeen(readReconTourSeen(academyId));
    setWizardStepIndex(0);
  }, [academyId]);

  const wizard = useMemo(
    () =>
      computeReconWizardState({
        statementsCount,
        dismissed: wizardDismissed && !forceWizard,
        forceWizard,
        hasImported,
      }),
    [statementsCount, wizardDismissed, forceWizard, hasImported]
  );

  const showTour = useMemo(
    () => shouldShowReconTour({ inDetail, tourSeen: tourSeen && !forceTour, forceTour }),
    [inDetail, tourSeen, forceTour]
  );

  const dismissWizard = useCallback(() => {
    writeReconWizardDismissed(academyId);
    setWizardDismissed(true);
  }, [academyId]);

  const reopenWizard = useCallback(() => {
    clearReconWizardDismissed(academyId);
    setWizardDismissed(false);
    setWizardStepIndex(0);
  }, [academyId]);

  const completeTour = useCallback(() => {
    writeReconTourSeen(academyId);
    setTourSeen(true);
  }, [academyId]);

  const advanceWizardStep = useCallback(() => {
    setWizardStepIndex((i) => Math.min(i + 1, wizard.totalSteps - 1));
  }, [wizard.totalSteps]);

  const currentWizardStep = wizard.steps[Math.min(wizardStepIndex, wizard.steps.length - 1)] || wizard.currentStep;

  return {
    wizard: {
      ...wizard,
      currentStep: currentWizardStep,
      show: wizard.show && !inDetail,
    },
    showTour,
    dismissWizard,
    reopenWizard,
    completeTour,
    advanceWizardStep,
    forceWizard,
    forceTour,
  };
}
