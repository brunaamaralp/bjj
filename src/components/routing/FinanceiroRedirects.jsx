import { Navigate, useSearchParams } from 'react-router-dom';
import {
  financeiroLegacyTabToSlug,
  isFinanceiroConfigTabSlug,
  EMPRESA_FINANCE_CONFIG_PATH,
} from '../../lib/financeiroHubTabs.js';

/** /caixa → /financeiro preservando ?tab= (configuração → Minha academia) */
export function CaixaRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const slug = financeiroLegacyTabToSlug(tab);
  if (isFinanceiroConfigTabSlug(slug)) {
    return <Navigate to={EMPRESA_FINANCE_CONFIG_PATH} replace />;
  }
  const qs = tab ? `?tab=${encodeURIComponent(slug)}` : '';
  return <Navigate to={`/financeiro${qs}`} replace />;
}

/** /finance → Minha academia → Financeiro */
export function FinanceRedirect() {
  return <Navigate to={EMPRESA_FINANCE_CONFIG_PATH} replace />;
}

/** /mensalidades → /financeiro?tab=mensalidades (preserva query) */
export function MensalidadesRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set('tab', 'mensalidades');
  return <Navigate to={`/financeiro?${params.toString()}`} replace />;
}
