/**
 * Mensagens da API Autentique (GraphQL) costumam vir em inglês e pouco claras.
 */
export function humanizeAutentiqueError(message: string): string {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();

  if (!raw) return 'Não foi possível enviar o contrato para a Autentique. Tente novamente.';
  if (lower === 'validation') {
    return 'A Autentique recusou os dados dos signatários. Confira nome, e-mail e telefone de cada parte (incluindo a contratada).';
  }
  if (lower.includes('signer') && lower.includes('email')) {
    return 'Informe um e-mail válido para cada signatário que receberá o link por e-mail.';
  }
  if (lower === 'autentique_not_configured') {
    return 'Integração com Autentique não configurada no servidor.';
  }
  if (lower === 'signers_required') {
    return 'Adicione pelo menos um signatário.';
  }

  return raw;
}

export function isAutentiqueClientError(message: string): boolean {
  const lower = String(message || '').trim().toLowerCase();
  return (
    lower === 'validation' ||
    lower === 'signers_required' ||
    lower === 'autentique_not_configured' ||
    lower === 'name_required' ||
    lower === 'signer_must_have_email_name_or_phone' ||
    lower.includes('invalid') ||
    lower.includes('signer')
  );
}
