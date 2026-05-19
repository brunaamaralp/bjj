/** Extrai nome de atributo rejeitado em erros do Appwrite. */
export function parseUnknownAttributeFromMessage(msg) {
  const s = String(msg || '');
  let m = s.match(/Unknown attribute:\s*"([^"]+)"/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*'([^']+)'/i);
  if (m) return m[1];
  m = s.match(/Unknown attribute:\s*([\w.]+)/i);
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
  emergencyContact: 'Contato de emergência',
  emergencyPhone: 'Telefone de emergência',
};

function labelForAttr(key) {
  return ATTR_LABELS[key] || key;
}

/**
 * Mensagem amigável e específica para erros de validação/schema do Appwrite.
 * Retorna null se não reconhecer o padrão.
 */
export function describeAppwriteError(err) {
  const msg = err?.message ?? String(err ?? '');
  if (!msg) return null;

  const unknown = parseUnknownAttributeFromMessage(msg);
  if (unknown) {
    return `Campo "${labelForAttr(unknown)}" (${unknown}) não existe na coleção leads do Appwrite. Execute: npm run provision:lead-payment-attrs`;
  }

  const attrM = msg.match(/Attribute\s+"([^"]+)"/i);
  if (attrM) {
    const key = attrM[1];
    const label = labelForAttr(key);
    const sizeM = msg.match(/no longer than (\d+)/i);
    if (sizeM) {
      return `O campo "${label}" excede o limite de ${sizeM[1]} caracteres.`;
    }
    if (/invalid type|must be a valid/i.test(msg)) {
      return `Valor inválido no campo "${label}". Verifique o formato do dado.`;
    }
    return `Erro no campo "${label}". Verifique o valor informado.`;
  }

  if (/Invalid document structure/i.test(msg) && /required/i.test(msg)) {
    return 'Preencha todos os campos obrigatórios do cadastro.';
  }

  return null;
}
