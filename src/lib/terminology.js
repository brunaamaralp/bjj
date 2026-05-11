import { useLeadStore } from '../store/useLeadStore';

export const TERMS = {
  fitness: {
    student: 'Aluno',
    students: 'Alunos',
    trial: 'Aula experimental',
    trialShort: 'Experimental',
    enrollment: 'Matricular',
    attendance: 'Presença',
    plan: 'Plano',
    belt: 'Faixa',
    kimono: 'Kimono',
  },
  physio: {
    student: 'Paciente',
    students: 'Pacientes',
    trial: 'Avaliação',
    trialShort: 'Avaliação',
    enrollment: 'Início de protocolo',
    attendance: 'Atendimento',
    plan: 'Protocolo',
    belt: 'Evolução',
    kimono: 'Equipamento',
  },
};

export function useTerms() {
  const vertical = useLeadStore((s) => s.vertical);
  return TERMS[vertical] || TERMS.fitness;
}
