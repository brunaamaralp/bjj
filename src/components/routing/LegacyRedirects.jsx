import { Navigate, useSearchParams } from 'react-router-dom';
import { resolveEmpresaLegacyTabRedirect } from '../../lib/empresaLegacyRedirects.js';

export { CaixaRedirect, FinanceRedirect, MensalidadesRedirect } from './FinanceiroRedirects.jsx';

export function PlanosRedirect() {
  return <Navigate to="/conta?tab=assinatura" replace />;
}

/** Legado: /contratos e abas antigas → hub Alunos ou modelos em Empresa. */
export function ContratosRedirect() {
  const [searchParams] = useSearchParams();
  const raw = String(searchParams.get('tab') || '').trim().toLowerCase();
  if (raw === 'modelos') {
    return <Navigate to="/empresa?tab=contratos" replace />;
  }
  return <Navigate to="/alunos?tab=contratos" replace />;
}

export function ContratosModelosRedirect() {
  return <Navigate to="/empresa?tab=contratos" replace />;
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
