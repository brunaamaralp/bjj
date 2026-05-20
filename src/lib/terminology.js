/**
 * Glossário de termos canônicos do Nave
 *
 * Regras:
 * - Pessoa pré-matrícula: labels.leads (configurável por academia) — use contactLabelSingular()
 * - Pessoa matriculada: terms.student / terms.students
 * - Cliente sem vínculo (venda): "Cliente avulso" (fixo)
 * - Salvar edição: "Salvar"
 * - Confirmar ação irreversível: "Confirmar [ação]"
 * - Registrar evento pontual: "Registrar"
 * - Concluir fluxo: "Concluir [fluxo]"
 * - Criar item novo: "Criar [item]"
 * - Fechar sem salvar: "Cancelar"
 * - Voltar de página: "Voltar"
 * - Excluir registro permanentemente: "Excluir"
 * - Desativar sem excluir: "Desativar" (produto) / "Desligar" (aluno/paciente)
 * - WhatsApp conectado: "WhatsApp conectado" (não "Instância ligada")
 */

import { useLeadStore } from '../store/useLeadStore';
import { LEAD_STATUS } from './leadStatus.js';

/** Singular do rótulo de contato pré-matrícula (ex.: "Leads" → "Lead"). */
export function contactLabelSingular(labels) {
  const plural = String(labels?.leads || 'Contatos').trim() || 'Contatos';
  if (plural.toLowerCase().endsWith('s') && plural.length > 1) {
    return plural.slice(0, -1);
  }
  return plural;
}

/** Rótulo de status operacional (valor salvo pode ser «Matriculado»). */
export function operationalStatusDisplayLabel(terms, status) {
  if (status === LEAD_STATUS.CONVERTED) return terms.convertedStatusUi;
  return status;
}

/** Rótulo de etapa do funil cujo id técnico é «Matriculado». */
export function pipelineStageDisplayLabel(terms, stageId) {
  if (String(stageId || '').trim() === 'Matriculado') return terms.pipelineEnrolledColumnLabel;
  return String(stageId || '').trim() || '—';
}

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
    /** Depois de "Nenhum aluno … ainda." */
    enrolledPastParticiple: 'matriculado',
    /** Texto de ajuda sob a lista vazia; use {pipeline} para o nome do funil */
    studentsEmptyHowItWorks:
      'Matrículas são feitas pelo {pipeline} — mova um contato para o status «Matriculado».',
    /** Rodapé do botão "Carregar mais"; use {students} e {pipeline} */
    studentsLoadMoreFootnote:
      'A lista de {students} usa os mesmos dados do servidor que o {pipeline}. Carregue mais para incluir matriculados em registros antigos.',
    /** Tooltip exportação; {students} e {student} em minúsculas no uso */
    exportStudentsTooltip:
      'Exporta {students} com status Matriculado ou tipo de contato {student} (mesmo critério da lista). Até 5000 por critério no servidor.',
    /** Status convertido na UI (valor persistido segue canônico). */
    convertedStatusUi: 'Matriculado',
    /** Coluna do funil com id «Matriculado». */
    pipelineEnrolledColumnLabel: 'Matrícula',
    leadMarkedConvertedToast: 'Marcado como matriculado.',
    pipelineEnrollmentSuccessToast: 'Matrícula registrada com sucesso!',
    matriculaModalTitle: 'Matricular aluno',
    matriculaModalSubtitle: 'Como deseja registrar a matrícula?',
    matriculaModalSimpleCta: 'Só matricular',
    reportsDrillConvertedTitle: 'Novos alunos no período',
    reportsMetricConvertedShort: 'Novos alunos',
    reportsExportConvertedFileSlug: 'matriculas',
    reportsClosureRateInsight:
      '{converted} de {completed} que compareceram se matricularam',
    reportsTimingAttendedToEnrolled: 'Aula → Matrícula',
    importSheetStudentRowHint:
      '<strong>Nome / Nome do aluno</strong> = aluno matriculado. Opcional: <strong>Responsável</strong>, <strong>Nome do pai</strong>, <strong>Contato</strong>, etc. = quem usa o WhatsApp (recomendado para Criança/Juniores).',
    nlCommandBarMarkEnrolledResult: 'Status matriculado · tipo aluno',
    nlPipelineMoveForbiddenHint:
      'Esta etapa exige outro comando: matricular, não compareceu, perdido ou agendar experimental com data e hora.',
    automationConvertedLabel: 'Matrícula realizada',
    automationConvertedDescription: 'Boas-vindas enviadas imediatamente após matricular.',
    agentEnrollmentSummaryLabel: 'Matrícula',
    agentWizardEnrollmentQuestion: 'Há taxa de matrícula? Se sim, qual o valor?',
    agentWizardEnrollmentPlaceholder: 'Valor da matrícula',
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
    enrolledPastParticiple: 'em acompanhamento',
    studentsEmptyHowItWorks:
      'Quem aparece aqui foi marcado no {pipeline} como paciente em acompanhamento (fluxo concluído no funil).',
    studentsLoadMoreFootnote:
      'A lista de {students} usa os mesmos dados do servidor que o {pipeline}. Carregue mais para incluir pacientes em acompanhamento registrados há mais tempo.',
    exportStudentsTooltip:
      'Exporta {students} já em acompanhamento ou como tipo de contato {student} (mesmo critério da lista). Até 5000 por critério no servidor.',
    convertedStatusUi: 'Em acompanhamento',
    pipelineEnrolledColumnLabel: 'Acompanhamento',
    leadMarkedConvertedToast: 'Marcado como em acompanhamento.',
    pipelineEnrollmentSuccessToast: 'Acompanhamento registrado com sucesso!',
    matriculaModalTitle: 'Iniciar acompanhamento',
    matriculaModalSubtitle: 'Como deseja registrar o início de acompanhamento?',
    matriculaModalSimpleCta: 'Só registrar',
    reportsDrillConvertedTitle: 'Entradas em acompanhamento no período',
    reportsMetricConvertedShort: 'Acompanhamento',
    reportsExportConvertedFileSlug: 'acompanhamentos',
    reportsClosureRateInsight:
      '{converted} de {completed} que compareceram iniciaram acompanhamento',
    reportsTimingAttendedToEnrolled: 'Avaliação → Acompanhamento',
    importSheetStudentRowHint:
      '<strong>Nome / Nome do paciente</strong> = paciente em acompanhamento. Opcional: <strong>Responsável</strong>, <strong>Nome do contato</strong>, etc. = quem usa o WhatsApp.',
    nlCommandBarMarkEnrolledResult: 'Status em acompanhamento · tipo paciente',
    nlPipelineMoveForbiddenHint:
      'Esta etapa exige outro comando: início de protocolo, não compareceu, perdido ou agendar avaliação com data e hora.',
    automationConvertedLabel: 'Acompanhamento iniciado',
    automationConvertedDescription: 'Mensagem enviada imediatamente após registrar o início de acompanhamento.',
    agentEnrollmentSummaryLabel: 'Taxa de cadastro / início',
    agentWizardEnrollmentQuestion: 'Há taxa de cadastro ou valor de primeira consulta? Se sim, qual o valor?',
    agentWizardEnrollmentPlaceholder: 'Valor (taxa de cadastro / primeira consulta)',
  },
};

export function useTerms() {
  const vertical = useLeadStore((s) => s.vertical);
  return TERMS[vertical] || TERMS.fitness;
}
