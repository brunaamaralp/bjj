import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isIntegracoesSettingsSection } from '../lib/integracoesSettingsSections.js';

export default function Integracoes() {
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const section = isIntegracoesSettingsSection(rawTab) || 'whatsapp';
  return <Navigate to={`/configuracoes?tab=integracoes&section=${section}`} replace />;
}
