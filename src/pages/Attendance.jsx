import { Navigate } from 'react-router-dom';

/** Rota legada — presença da catraca ficou em Alunos e Recepção. */
export default function Attendance() {
  return <Navigate to="/students?view=presenca" replace />;
}
