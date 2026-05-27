import { Navigate } from 'react-router-dom';

/** @deprecated Use /alunos?tab=contratos */
export default function Contratos() {
  return <Navigate to="/alunos?tab=contratos" replace />;
}
