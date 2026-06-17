import { Navigate } from 'react-router-dom';

/** Rota legada — histórico da catraca ficou em Recepção (/?tab=catraca&section=historico). */
export default function Attendance() {
  return <Navigate to="/?tab=catraca&section=historico" replace />;
}
