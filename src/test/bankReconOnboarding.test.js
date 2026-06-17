import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  computeReconWizardState,
  readReconWizardDismissed,
  reconWizardDismissKey,
  shouldShowReconTour,
  writeReconWizardDismissed,
} from '../lib/bankReconOnboarding.js';

describe('bankReconOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows wizard on empty statements when not dismissed', () => {
    const state = computeReconWizardState({ statementsCount: 0, dismissed: false });
    expect(state.show).toBe(true);
    expect(state.currentStep.id).toBe('import');
  });

  it('hides wizard after dismiss storage', () => {
    writeReconWizardDismissed('acad-1');
    expect(readReconWizardDismissed('acad-1')).toBe(true);
    const state = computeReconWizardState({ statementsCount: 0, dismissed: true });
    expect(state.show).toBe(false);
  });

  it('marks import step done after first statement', () => {
    const state = computeReconWizardState({ statementsCount: 2, dismissed: false });
    expect(state.steps.find((s) => s.id === 'import')?.done).toBe(true);
    expect(state.show).toBe(false);
  });

  it('shows tour only in detail when not seen', () => {
    expect(shouldShowReconTour({ inDetail: true, tourSeen: false })).toBe(true);
    expect(shouldShowReconTour({ inDetail: false, tourSeen: false })).toBe(false);
    expect(shouldShowReconTour({ inDetail: true, tourSeen: true })).toBe(false);
  });

  it('uses academy-scoped wizard key', () => {
    expect(reconWizardDismissKey('abc')).toBe('navi_recon_wizard_dismissed_abc');
  });
});
