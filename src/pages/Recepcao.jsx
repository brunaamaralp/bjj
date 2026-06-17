import { Navigate, useSearchParams } from 'react-router-dom';
import { buildRecepcaoLegacyRedirectPath } from '../lib/recepcaoHubTabs.js';

/** Rota legada — catraca e histórico ficam em /?tab=catraca. */
export default function Recepcao() {
  const [searchParams] = useSearchParams();
  const historico = searchParams.get('tab') === 'historico';
  return <Navigate to={buildRecepcaoLegacyRedirectPath({ historico })} replace />;
}
