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
    /** Navegação e título quando o nome do negócio ainda não existe */
    myWorkspace: 'Minha academia',
    /** Substantivo (minúsculo) para frases: "da …", "sua …", "nome da …" */
    workspaceNoun: 'academia',
    /** Mesmo substantivo com inicial maiúscula (títulos: "Dados da …") */
    workspaceNounTitle: 'Academia',
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
    myWorkspace: 'Minha clínica',
    workspaceNoun: 'clínica',
    workspaceNounTitle: 'Clínica',
  },
};

export function useTerms() {
  const vertical = useLeadStore((s) => s.vertical);
  return TERMS[vertical] || TERMS.fitness;
}
