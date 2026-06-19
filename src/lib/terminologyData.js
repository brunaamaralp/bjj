/**
 * Dados estáticos de terminologia por vertical.
 * Importável tanto no servidor (Node.js) quanto no browser.
 * Sem dependências de React ou stores.
 */
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
    myWorkspace: 'Minha academia',
    workspaceNoun: 'academia',
    workspaceNounTitle: 'Academia',
    enrolledPastParticiple: 'matriculado',
    studentsEmptyHowItWorks:
      'Matrículas são feitas pelo {pipeline} — mova um contato para o status «Matriculado».',
    studentsLoadMoreFootnote:
      'A lista de {students} usa os mesmos dados do servidor que o {pipeline}. Carregue mais para incluir matriculados em registros antigos.',
    exportStudentsTooltip:
      'Exporta {students} com status Matriculado ou tipo de contato {student} (mesmo critério da lista). Até 5000 por critério no servidor.',
    convertedStatusUi: 'Matriculado',
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
