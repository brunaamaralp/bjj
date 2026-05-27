import { Navigate, useSearchParams } from 'react-router-dom';
import { financeLegacyTabToFinanceiro, financeiroLegacyTabToSlug } from '../../lib/financeiroHubTabs.js';

/** /caixa → /financeiro preservando ?tab= */
export function CaixaRedirect() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  const qs = tab ? `?tab=${encodeURIComponent(financeiroLegacyTabToSlug(tab))}` : '';
  return <Navigate to={`/financeiro${qs}`} replace />;
}

/** /finance → /financeiro (mapeia abas legadas de contabilidade) */
export function FinanceRedirect() {
  const [searchParams] = useSearchParams();
  const tab = financeLegacyTabToFinanceiro(searchParams.get('tab'));
  return <Navigate to={`/financeiro?tab=${tab}`} replace />;
}

/** /mensalidades → /financeiro?tab=mensalidades (preserva query) */
export function MensalidadesRedirect() {
  const [searchParams] = useSearchParams();
  const params = new URLSearchParams(searchParams);
  params.set('tab', 'mensalidades');
  return <Navigate to={`/financeiro?${params.toString()}`} replace />;
}
