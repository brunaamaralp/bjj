/** Extrai nome de atributo rejeitado em erros do Appwrite. */
export function parseUnknownAttributeFromMessage(msg) {
  const s = String(msg || '');
  let m = s.match(/Unknown attribute:\s*"([^"]+)"/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*'([^']+)'/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*([\w.]+)/i);
  if (m) return m[1];
  m = s.match(/Invalid document structure:\s*Unknown attribute\s+"?([^"\s]+)"?/i);
  return m ? m[1] : null;
}

const ATTR_LABELS = {
  preferred_payment_account: 'Conta habitual de pagamento',
  preferred_payment_method: 'Forma de pagamento habitual',
  due_day: 'Dia de vencimento',
  dueDay: 'Dia de vencimento',
  turma: 'Turma',
  class_name: 'Turma',
  sexo: 'Sexo',
  cpf: 'CPF',
  responsavel: 'Responsável',
  birth_date: 'Data de nascimento',
  enrollmentDate: 'Data de matrícula',
  exit_date: 'Data de saída',
  emergencyContact: 'Contato de emergência',
  emergencyPhone: 'Telefone de emergência',
  settings: 'Configurações da academia',
  student_freeze_reasons: 'Motivos de trancamento',
  student_exit_reasons: 'Motivos de desligamento',
  onboardingChecklist: 'Checklist de configuração',
  financeConfig: 'Configuração financeira',
  updated_at: 'Data de atualização',
  items_json: 'Itens do template de tarefas',
  academy_id: 'Academia',
  trigger: 'Gatilho do template',
  enabled: 'Template ativo',
};

/** Atributo → { collection, provisionCommand } — apenas para log de desenvolvimento */
const ATTR_PROVISION_HINTS = {
  preferred_payment_account: { collection: 'leads', cmd: 'npm run provision:lead-payment-attrs' },
  preferred_payment_method: { collection: 'leads', cmd: 'npm run provision:lead-payment-attrs' },
  settings: { collection: 'academies', cmd: 'npm run provision:academy-attrs' },
  student_freeze_reasons: { collection: 'academies', cmd: 'npm run provision:academy-attrs' },
  student_exit_reasons: { collection: 'academies', cmd: 'npm run provision:academy-attrs' },
  onboardingChecklist: { collection: 'academies', cmd: 'npm run provision:academy-attrs' },
  financeConfig: { collection: 'academies', cmd: 'npm run provision:academy-attrs' },
  updated_at: { collection: 'students', cmd: 'npm run provision:students' },
  items_json: { collection: 'task_templates', cmd: 'npm run provision:task-templates' },
  academy_id: { collection: 'task_templates', cmd: 'npm run provision:task-templates' },
  trigger: { collection: 'task_templates', cmd: 'npm run provision:task-templates' },
  name: { collection: 'task_templates', cmd: 'npm run provision:task-templates' },
  enabled: { collection: 'task_templates', cmd: 'npm run provision:task-templates' },
};

function labelForAttr(key) {
  return ATTR_LABELS[key] || key.replace(/_/g, ' ');
}

function provisionHintForAttr(key) {
  const hint = ATTR_PROVISION_HINTS[key];
  if (hint) return hint;
  return { collection: 'desconhecida', cmd: 'npm run provision:academy-attrs' };
}

/** Detalhe técnico para console — nunca exibir ao usuário final. */
export function getAppwriteDevHint(err) {
  const msg = err?.message ?? String(err ?? '');
  if (!msg) return null;

  const unknown = parseUnknownAttributeFromMessage(msg);
  if (unknown) {
    const { collection, cmd } = provisionHintForAttr(unknown);
    return { kind: 'unknown_attribute', attribute: unknown, collection, provision: cmd, raw: msg };
  }

  const attrM = msg.match(/Attribute\s+"([^"]+)"/i);
  if (attrM) {
    return { kind: 'attribute_validation', attribute: attrM[1], raw: msg };
  }

  if (/Invalid document structure/i.test(msg)) {
    return { kind: 'invalid_document', raw: msg };
  }

  return null;
}

/**
 * Mensagem amigável para erros de validação/schema do Appwrite.
 * Retorna null se não reconhecer o padrão.
 */
export function describeAppwriteError(err) {
  const msg = err?.message ?? String(err ?? '');
  if (!msg) return null;

  const unknown = parseUnknownAttributeFromMessage(msg);
  if (unknown) {
    const label = labelForAttr(unknown);
    return `O campo "${label}" não está disponível no momento. Tente novamente ou fale com o suporte.`;
  }

  const attrM = msg.match(/Attribute\s+"([^"]+)"/i);
  if (attrM) {
    const key = attrM[1];
    const label = labelForAttr(key);
    const sizeM = msg.match(/no longer than (\d+)/i);
    if (sizeM) {
      if (key === 'financeConfig') {
        return 'As configurações financeiras são muito extensas. Tente salvar com menos detalhes ou fale com o suporte.';
      }
      return `O campo "${label}" é muito longo. Reduza o texto e tente novamente.`;
    }
    if (/invalid type|must be a valid/i.test(msg)) {
      return `O valor informado em "${label}" não é válido. Verifique e tente novamente.`;
    }
    if (/must be an array/i.test(msg)) {
      return `O campo "${label}" está com formato incorreto. Tente novamente ou fale com o suporte.`;
    }
    return `Não foi possível validar o campo "${label}". Verifique o valor e tente novamente.`;
  }

  if (/Invalid document structure/i.test(msg) && /required/i.test(msg)) {
    return 'Preencha todos os campos obrigatórios.';
  }

  if (/create_document_schema_incompatible|update_document_schema_incompatible/i.test(msg)) {
    return 'Não foi possível salvar porque alguns dados ainda não estão disponíveis. Tente novamente ou fale com o suporte.';
  }

  return null;
}
