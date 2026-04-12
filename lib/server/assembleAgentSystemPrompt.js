/**
 * Monta o system prompt completo enviado ao Claude (mesma ordem que agentRespond).
 */
export function assembleAgentSystemPrompt({
  effectiveIntro,
  effectiveBody,
  extraSuffix,
  profileLine,
  nomeContatoLine,
  summaryText,
  faqItems
}) {
  const baseSystemPrompt = [effectiveIntro, profileLine, effectiveBody, extraSuffix].filter(Boolean).join('\n');
  const faqBlock =
    Array.isArray(faqItems) && faqItems.length > 0
      ? `PERGUNTAS FREQUENTES (use como base factual; não contradiga):\n${faqItems.map((item) => `P: ${item.q}\nR: ${item.a}`).join('\n\n')}`
      : '';
  return [
    baseSystemPrompt,
    nomeContatoLine,
    summaryText ? `Resumo do histórico (pode estar desatualizado):\n${summaryText}` : '',
    faqBlock,
    'CLASSIFICAÇÃO — tipo_contato:\n' +
      'Use tipo_contato "aluno" apenas para quem já treina na academia (matrícula ativa). Quem está conhecendo ou quer experimentar é "lead". intencao "aluno_atual" é para dúvidas de quem já é aluno (não conta como lead novo no funil).\n\n' +
      'CLASSIFICAÇÃO — lead_quente:\n' +
      'Quando classificar lead_quente como "sim", sua próxima ação no campo "resposta" deve ser o CTA de agendamento da aula experimental ou pedir/confirmar o nome completo para agendar — nunca mais uma pergunta de qualificação genérica.',
    `Retorne SOMENTE um JSON válido (sem markdown) no seguinte formato:\n` +
      `{"resposta":"string","classificacao":{"intencao":"horarios_adulto|horarios_crianca|horarios_junior|preco_adulto|preco_crianca|preco_uniforme_adulto|preco_uniforme_infantil|aula_experimental|duvida|aluno_atual|outro","tipo_contato":"lead|aluno","prioridade":"alta|media|baixa","lead_quente":"sim|nao","precisa_resposta_humana":"sim|nao","perfil_lead":"adulto_para_si|responsavel_crianca|responsavel_junior|indefinido"}}`
  ]
    .filter(Boolean)
    .join('\n\n');
}
