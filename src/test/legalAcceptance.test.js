import { describe, it, expect } from 'vitest';
import { buildLegalAcceptance, hasAcceptedCurrentLegal } from '../lib/legalAcceptance.js';
import { LEGAL_VERSION } from '../lib/legalConstants.js';

describe('legalAcceptance', () => {
  it('buildLegalAcceptance inclui versões vigentes', () => {
    const acceptance = buildLegalAcceptance();
    expect(acceptance.termsVersion).toBe(LEGAL_VERSION.terms);
    expect(acceptance.privacyVersion).toBe(LEGAL_VERSION.privacy);
    expect(acceptance.acceptedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('hasAcceptedCurrentLegal valida prefs atuais', () => {
    expect(hasAcceptedCurrentLegal(null)).toBe(false);
    expect(hasAcceptedCurrentLegal({
      legal_terms_version: LEGAL_VERSION.terms,
      legal_privacy_version: LEGAL_VERSION.privacy,
      legal_accepted_at: '2026-06-12T12:00:00.000Z',
    })).toBe(true);
    expect(hasAcceptedCurrentLegal({
      legal_terms_version: 'old',
      legal_privacy_version: LEGAL_VERSION.privacy,
      legal_accepted_at: '2026-06-12T12:00:00.000Z',
    })).toBe(false);
  });
});
