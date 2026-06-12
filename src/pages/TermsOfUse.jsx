import React from 'react';
import LegalDocumentPage from '../components/legal/LegalDocumentPage.jsx';
import { TERMS_SECTIONS } from '../lib/legalContent.js';

export default function TermsOfUse() {
  return <LegalDocumentPage kind="terms" sections={TERMS_SECTIONS} />;
}
