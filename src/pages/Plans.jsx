import { PlanosRedirect } from '../components/routing/LegacyRedirects.jsx';

/** @deprecated Use /conta?tab=assinatura */
export default function Plans() {
  return <PlanosRedirect />;
}
