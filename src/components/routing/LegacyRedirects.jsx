import { Navigate, useSearchParams } from 'react-router-dom';
import { financeLegacyTabToCaixa } from '../../lib/hubTabs';
import { resolveEmpresaLegacyTabRedirect } from '../../lib/empresaLegacyRedirects.js';

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

/** Redireciona ?tab= legado em /empresa para as novas rotas. */
export function EmpresaLegacyTabRedirect() {
  const [searchParams] = useSearchParams();
  const target = resolveEmpresaLegacyTabRedirect(searchParams.get('tab'));
  if (target) return <Navigate to={target} replace />;
  return <Navigate to="/empresa" replace />;
}
