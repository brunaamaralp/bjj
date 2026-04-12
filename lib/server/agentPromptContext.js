export function firstName(name) {
  const n = String(name || '').trim();
  if (!n) return '';
  return n.split(/\s+/).filter(Boolean)[0] || '';
}

function getLeadTurmaFromDoc(doc) {
  return String(doc?.type || doc?.tipo || '').trim();
}

function normalizeTurmaKey(raw) {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function turmaIsKidsOrJuniores(raw) {
  const t = normalizeTurmaKey(raw);
  if (!t) return false;
  if (t.includes('junior')) return true;
  if (t.includes('kids')) return true;
  if (t.includes('crianca')) return true;
  if (t.includes('infantil')) return true;
  if (t.includes('pequeno')) return true;
  return false;
}

function turmaIsAdulto(raw) {
  const t = normalizeTurmaKey(raw);
  if (!t) return false;
  if (t.includes('adult')) return true;
  if (t.includes('feminin')) return true;
  if (t.includes('no-gi') || t.includes('nogi')) return true;
  return false;
}

/**
 * Monta contexto de perfil + linha "nome" para o system prompt.
 * kids/juniores/criança: telefone costuma ser do responsável — nome do cadastro é do aluno.
 */
export function buildPromptContactContext(leadDoc, whatsappDisplayNameRaw) {
  const waFirst = firstName(whatsappDisplayNameRaw) || 'amigo';

  if (!leadDoc) {
    return {
      mode: 'lead',
      profileAppendix: '',
      nomeContatoLine: `Nome do contato (WhatsApp): ${waFirst}.`
    };
  }

  const turma = getLeadTurmaFromDoc(leadDoc);
  const cadastroNome = String(leadDoc.name || '').trim() || '(sem nome no cadastro)';

  if (turmaIsKidsOrJuniores(turma)) {
    const turmaLabel = turma || 'kids/juniores';
    const parentName = String(leadDoc.parentName || leadDoc.parent_name || '').trim();

    if (parentName) {
      return {
        mode: 'responsavel_aluno',
        nomeAluno: cadastroNome,
        turma,
        profileAppendix:
          '\n\nCONTEXTO OBRIGATÓRIO — TELEFONE DO RESPONSÁVEL:\n' +
          `Turma/tipo "${turmaLabel}". O nome "${cadastroNome}" no cadastro é do ALUNO (criança/junior). O responsável cadastrado é "${parentName}".\n` +
          '- Nunca trate o interlocutor como se se chamasse pelo nome do aluno.\n' +
          '- Dirija-se ao responsável; use o nome do aluno ao falar do filho/aluno (horário, experimental, etc.).\n' +
          '- Pode tratar o responsável pelo nome cadastrado quando soar natural; se o nome no WhatsApp divergir muito, adapte à conversa.',
        nomeContatoLine:
          `Nome no cadastro (ALUNO — turma ${turmaLabel}): ${cadastroNome}.\n` +
          `Responsável no cadastro: ${parentName}. Não confundir os dois.`
      };
    }

    return {
      mode: 'responsavel_aluno',
      nomeAluno: cadastroNome,
      turma,
      profileAppendix:
        '\n\nCONTEXTO OBRIGATÓRIO — TELEFONE DO RESPONSÁVEL:\n' +
        `Este número está no cadastro com turma/tipo "${turmaLabel}". O nome "${cadastroNome}" no cadastro é do ALUNO (criança/junior), não da pessoa que usa o WhatsApp.\n` +
        '- Nunca trate o interlocutor como se se chamasse esse nome.\n' +
        '- Dirija-se ao responsável; use o nome do aluno só ao falar do filho/aluno (horário da turma, experimental da criança, etc.).\n' +
        '- O nome de quem escreve não vem do cadastro como pessoa — se não estiver claro, pergunte educadamente como prefere ser chamado/a.\n' +
        '- O primeiro nome exibido no WhatsApp pode ser do responsável; mesmo assim não confunda com o nome do aluno cadastrado.',
      nomeContatoLine:
        `Nome no cadastro (ALUNO — turma ${turmaLabel}): ${cadastroNome}.\n` +
        `Quem escreve: RESPONSÁVEL por este número — não usar "${cadastroNome}" como nome de quem fala. ` +
        'Se necessário, pergunte como prefere ser chamado/a.'
    };
  }

  if (turmaIsAdulto(turma)) {
    return {
      mode: 'aluno_adulto',
      turma,
      profileAppendix:
        '\n\nCONTEXTO DO CADASTRO:\n' +
        `Turma/tipo: ${turma}. O nome "${cadastroNome}" no cadastro refere-se ao próprio praticante deste número (adulto).`,
      nomeContatoLine: `Nome do contato (cadastro adulto — turma ${turma}): ${cadastroNome}.`
    };
  }

  return {
    mode: 'lead_com_cadastro',
    turma,
    profileAppendix:
      '\n\nCONTEXTO DO CADASTRO:\n' +
      `Existe cadastro vinculado: "${cadastroNome}" (tipo/turma: ${turma || 'não informado'}). ` +
      'O telefone pode ser de responsável ou do próprio aluno — use a conversa para não confundir.',
    nomeContatoLine: `Cadastro: ${cadastroNome} (tipo: ${turma || '?'}). Primeiro nome no WhatsApp: ${waFirst}.`
  };
}

export function profileLineForSystemPrompt(contactCtx) {
  const base =
    'PERFIL DO CONTATO:\n' +
    'Use o cadastro de alunos e o contexto da conversa para identificar quem é a pessoa:\n\n' +
    'Se for LEAD (não matriculado):\n' +
    '- Foco em converter para aula experimental gratuita\n' +
    '- Qualifique rapidamente: para si ou para filho/a? Qual faixa etária?\n' +
    '- Ofereça o CTA de experimental no momento certo (quando já tem info suficiente)\n\n' +
    'Se for ALUNO ATIVO ou PAI/MÃE DE ALUNO:\n' +
    '- Trate como alguém que já conhece a academia\n' +
    '- Não ofereça aula experimental nem explique o que é Jiu-Jitsu\n' +
    '- Foque em resolver a dúvida diretamente (horário, pagamento, uniforme, etc.)\n' +
    '- Para assuntos financeiros ou administrativos, diga que vai passar para o responsável\n\n' +
    'Se não tiver certeza: trate como lead, mas adapte se a pessoa demonstrar familiaridade com a academia (mencionar faixa, professor, treino, mensalidade, etc.)';

  const cadastroVsWhatsApp =
    contactCtx?.mode !== 'lead'
      ? '\n\nREGRA FIXA — NOME NO CADASTRO:\n' +
        '- O nome do aluno e o do responsável (quando houver) salvos no cadastro da academia são a fonte de verdade.\n' +
        '- O nome exibido no perfil do WhatsApp não substitui nem corrige o cadastro; não diga que vai atualizar o cadastro só com base nesse nome.\n' +
        '- Use o WhatsApp, se fizer sentido, só como referência de tratamento na conversa; dados oficiais seguem o cadastro.\n'
      : '';

  return base + cadastroVsWhatsApp + (contactCtx?.profileAppendix || '');
}
