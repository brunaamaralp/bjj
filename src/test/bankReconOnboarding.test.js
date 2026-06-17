import { describe, expect, it, beforeEach } from 'vitest';
import {
  readReconTourSeen,
  reconTourSeenKey,
  shouldShowReconTour,
  writeReconTourSeen,
} from '../lib/bankReconOnboarding.js';

describe('bankReconOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shows tour only in detail when not seen', () => {
    expect(shouldShowReconTour({ inDetail: true, tourSeen: false })).toBe(true);
    expect(shouldShowReconTour({ inDetail: false, tourSeen: false })).toBe(false);
    expect(shouldShowReconTour({ inDetail: true, tourSeen: true })).toBe(false);
  });

  it('persists tour seen per academy', () => {
    writeReconTourSeen('acad-1');
    expect(readReconTourSeen('acad-1')).toBe(true);
    expect(readReconTourSeen('acad-2')).toBe(false);
  });

  it('uses academy-scoped tour key', () => {
    expect(reconTourSeenKey('abc')).toBe('navi_recon_tour_seen_abc');
  });
});
