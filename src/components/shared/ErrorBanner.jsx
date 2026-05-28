import React from 'react';
import StatusBanner from './StatusBanner.jsx';

/**
 * Banner de erro (alias de StatusBanner variant="error").
 */
export default function ErrorBanner(props) {
  return <StatusBanner variant="error" {...props} />;
}
