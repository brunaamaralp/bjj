/**
 * Heurísticas compartilhadas para busca por telefone (páginas + ⌘K).
 */

export function normalizePhoneSearchDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

/**
 * Busca em listas (Alunos/Funil): query “só telefone” com ≥4 dígitos.
 * Aceita máscara/espaços; rejeita texto com letras.
 */
export function isPagePhoneSearchQuery(raw) {
  const digits = normalizePhoneSearchDigits(raw);
  if (digits.length < 4) return false;
  const trimmed = String(raw || '').trim();
  const noise = trimmed.replace(/[\d\s()\-+.]/g, '');
  return noise.length === 0;
}

/**
 * ⌘K: extrai dígitos se houver ≥8 (aceita texto ao redor, ex. “quem é 11999…”).
 * @returns {string} dígitos ou ''
 */
export function extractNlPhoneSearchDigits(raw) {
  const digits = normalizePhoneSearchDigits(raw);
  return digits.length >= 8 ? digits : '';
}

/**
 * ⌘K: só faz lookup direto quando a intenção é buscar pessoa por telefone
 * (número puro ou frase curta de busca). Comandos com ação (“pagou”, “criar lead”…)
 * seguem o interpretador NL.
 */
export function isNlPhoneLookupQuery(raw) {
  const digits = extractNlPhoneSearchDigits(raw);
  if (!digits) return false;
  if (isPagePhoneSearchQuery(raw)) return true;

  const normalized = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

  if (
    /(pagou|pagamento|matricul|matricula|venda|vendeu|estoque|agend|marcar|mover|criar|cadast|check-?in|checkin|tranc|despes|ajust)/.test(
      normalized
    )
  ) {
    return false;
  }

  const withoutDigits = normalized.replace(/\d/g, ' ').replace(/[\s()\-+.]/g, ' ').trim();
  if (!withoutDigits) return true;

  // Frases curtas de busca: "quem e", "aluno", "buscar lead", etc.
  const words = withoutDigits.split(/\s+/).filter(Boolean);
  if (words.length > 4) return false;
  return words.every((w) =>
    /^(quem|e|eh|o|a|do|da|de|aluno|aluna|lead|buscar|busca|achar|encontre|encontrar|telefone|fone|tel|contato)$/.test(
      w
    )
  );
}
