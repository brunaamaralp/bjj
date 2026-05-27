import { MensalidadesRedirect } from '../components/routing/FinanceiroRedirects.jsx';

/** @deprecated Use /financeiro?tab=mensalidades */
export default function Mensalidades() {
  return <MensalidadesRedirect />;
}
