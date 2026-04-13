/**
 * Monta o system prompt completo enviado ao Claude (mesma ordem que agentRespond).
 */

export const COMMUNICATION_RULES = `
REGRAS DE COMUNICAÇÃO — OBRIGATÓRIAS SEMPRE:

TAMANHO:
- Máximo 3 linhas por mensagem
- Mensagem curta = resposta curta (1-2 linhas)
- Uma ideia por vez, nunca vários assuntos juntos

LINGUAGEM NATURAL:
- Escreva como uma pessoa real no WhatsApp
- Use: "tá", "né", "tô", "pra", "pro", "você"
- Nunca use linguagem corporativa ou formal

PALAVRAS E EXPRESSÕES PROIBIDAS — nunca use:
- Travessão (—)
- Ponto e vírgula (;)
- "Fico feliz em saber"
- "Que ótimo!"
- "Com certeza!"
- "Claro que sim!"
- "Qualquer dúvida pode contar comigo"
- "Estou à disposição"
- "Não hesite em entrar em contato"
- "Espero ter ajudado"
- "Posso te ajudar com mais alguma coisa?"
- Repetir o que a pessoa acabou de dizer

EMOJIS:
- Máximo 1 emoji por mensagem
- Nunca no início da frase
- Só quando for realmente natural

QUANDO A PESSOA FAZ UMA PERGUNTA:
- Responda direto, sem enrolação
- Se precisar de informação antes de responder,
  faça UMA pergunta por vez

QUANDO A PESSOA ESTÁ SÓ AVISANDO ALGO:
- Se a mensagem não tiver pergunta e for só
  um aviso, atualização ou agradecimento:
  RETORNE resposta VAZIA — não responda
- Exemplos de quando NÃO responder:
  "Vou pensar e te aviso"
  "Comprei o kimono mas ainda não fui"
  "Tô viajando essa semana"
  "Obrigado!"
  "Ok, entendido"
  "Anotado"
- Exemplos de quando RESPONDER:
  Qualquer mensagem com pergunta direta
  Qualquer mensagem pedindo informação
  Primeiro contato do lead
  Lead demonstrando interesse em agendar

EXEMPLOS:

Pessoa: "Vou avaliar a possibilidade de começar na segunda quinzena"
CERTO: [não responder — é só um aviso]

Pessoa: "Comprei o kimono mas ainda não fui"
CERTO: [não responder — é só um aviso]

Pessoa: "Obrigado!"
CERTO: [não responder]

Pessoa: "Oi, tudo bem?"
CERTO: "Oi! Tudo sim 😊 Como posso te ajudar?"
`.trim();

/** Bloco final de classificação (JSON + regras). Exportado para prévia no painel. */
export function buildClassificationBlock() {
  return [
    'CLASSIFICAÇÃO — tipo_contato:',
    'Use tipo_contato "aluno" apenas para quem já treina na academia (matrícula ativa). Quem está conhecendo ou quer experimentar é "lead". intencao "aluno_atual" é para dúvidas de quem já é aluno (não conta como lead novo no funil).',
    'CLASSIFICAÇÃO — lead_quente:',
    'Quando classificar lead_quente como "sim", sua próxima ação no campo "resposta" deve ser o CTA de agendamento da aula experimental ou pedir/confirmar o nome completo para agendar — nunca mais uma pergunta de qualificação genérica.',
    'RESPOSTA VAZIA — quando usar:',
    'Se a mensagem do usuário for só aviso, atualização, agradecimento ou confirmação sem pergunta (ex.: "ok", "entendido", "vou pensar", "obrigado"), retorne "resposta" como string vazia "".',
    'Nesse caso classificacao.intencao deve ser "aviso_sem_pergunta".',
    'NUNCA retorne "resposta" vazia no primeiro contato, se houver qualquer pergunta, se o lead quiser agendar ou tiver dúvida sobre preço, horário ou modalidade.',
    'Retorne SOMENTE um JSON válido (sem markdown) no seguinte formato:',
    '{"resposta":"string","classificacao":{"intencao":"horarios_adulto|horarios_crianca|horarios_junior|preco_adulto|preco_crianca|preco_uniforme_adulto|preco_uniforme_infantil|aula_experimental|duvida|aluno_atual|aviso_sem_pergunta|outro","tipo_contato":"lead|aluno","prioridade":"alta|media|baixa","lead_quente":"sim|nao","precisa_resposta_humana":"sim|nao","perfil_lead":"adulto_para_si|responsavel_crianca|responsavel_junior|indefinido"}}'
  ].join('\n\n');
}

export function assembleAgentSystemPrompt({
  effectiveIntro,
  effectiveBody,
  extraSuffix,
  profileLine,
  nomeContatoLine,
  summaryText,
  faqItems
}) {
  const faqBlock =
    Array.isArray(faqItems) && faqItems.length > 0
      ? `PERGUNTAS FREQUENTES (use como base factual; não contradiga):\n${faqItems.map((item) => `P: ${item.q}\nR: ${item.a}`).join('\n\n')}`
      : '';

  const summaryBlock = summaryText ? `Resumo do histórico (pode estar desatualizado):\n${summaryText}` : '';

  const classificationBlock = buildClassificationBlock();

  const systemParts = [
    effectiveIntro,
    COMMUNICATION_RULES,
    profileLine,
    effectiveBody,
    extraSuffix,
    nomeContatoLine,
    summaryBlock,
    faqBlock,
    classificationBlock
  ].filter(Boolean);

  return systemParts.join('\n\n');
}
