import { MensalidadesRedirect } from '../components/routing/FinanceiroRedirects.jsx';

/** @deprecated Use /financeiro?tab=a-receber&section=mensalidades */
export default function Mensalidades() {
  return <MensalidadesRedirect />;
}
