import { LEGAL_VERSION } from './legalConstants.js';

/** @returns {{ termsVersion: string, privacyVersion: string, acceptedAt: string }} */
export function buildLegalAcceptance() {
  return {
    termsVersion: LEGAL_VERSION.terms,
    privacyVersion: LEGAL_VERSION.privacy,
    acceptedAt: new Date().toISOString(),
  };
}

/** @param {Record<string, unknown> | null | undefined} prefs */
export function hasAcceptedCurrentLegal(prefs) {
  if (!prefs || typeof prefs !== 'object') return false;
  return (
    String(prefs.legal_terms_version || '') === LEGAL_VERSION.terms
    && String(prefs.legal_privacy_version || '') === LEGAL_VERSION.privacy
    && Boolean(prefs.legal_accepted_at)
  );
}
