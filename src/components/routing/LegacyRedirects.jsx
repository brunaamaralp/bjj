import { Navigate, useSearchParams } from 'react-router-dom';
import { financeLegacyTabToCaixa } from '../../lib/hubTabs';

export function PlanosRedirect() {
  return <Navigate to="/conta?tab=assinatura" replace />;
}

export function FinanceRedirect() {
  const [searchParams] = useSearchParams();
  const tab = financeLegacyTabToCaixa(searchParams.get('tab'));
  return <Navigate to={`/caixa?tab=${tab}`} replace />;
}

export function ContratosModelosRedirect() {
  return <Navigate to="/contratos?tab=modelos" replace />;
}

export function LojaTabRedirect({ tab }) {
  return <Navigate to={`/loja?tab=${tab}`} replace />;
}

export function TemplatesRedirect() {
  return <Navigate to="/automacoes?tab=modelos" replace />;
}
