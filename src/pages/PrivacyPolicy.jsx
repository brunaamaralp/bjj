import React from 'react';
import LegalDocumentPage from '../components/legal/LegalDocumentPage.jsx';
import { PRIVACY_SECTIONS } from '../lib/legalContent.js';

export default function PrivacyPolicy() {
  return <LegalDocumentPage kind="privacy" sections={PRIVACY_SECTIONS} />;
}
