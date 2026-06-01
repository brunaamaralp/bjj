/** Textos curtos para hints nas colunas do funil. */
export const PIPELINE_STAGE_HINTS = {
  Novo: 'Contatos que acabaram de entrar no funil.',
  'Aula experimental': 'Agendados para aula ou avaliação experimental.',
  'Aguardando decisão': 'Compareceram e aguardam retorno ou matrícula.',
  Matriculado:
    'Alunos matriculados pelo funil. Arraste um card de outra coluna para abrir o cadastro de matrícula.',
  'Não compareceu': 'Não compareceram à aula ou avaliação agendada.',
  Perdidos: 'Contatos que não seguiram no funil.',
};

export function hintForPipelineStage(stageId, label) {
  const id = String(stageId || '').trim();
  const lbl = String(label || '').trim();
  return PIPELINE_STAGE_HINTS[id] || PIPELINE_STAGE_HINTS[lbl] || `Contatos na etapa «${lbl || id}».`;
}
