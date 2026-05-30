import type { AutentiqueGraphQLError } from './parseAutentiqueErrors.js';
import { formatAutentiqueValidationDetail } from './parseAutentiqueErrors.js';

/**
 * Mensagens da API Autentique (GraphQL) costumam vir em inglês e pouco claras.
 */
export function humanizeAutentiqueError(
  message: string,
  errors?: AutentiqueGraphQLError[] | null
): string {
  const raw = String(message || '').trim();
  const lower = raw.toLowerCase();
  const detail = formatAutentiqueValidationDetail(errors);

  if (!raw) {
    return detail || 'Não foi possível enviar o contrato para a Autentique. Tente novamente.';
  }
  if (lower === 'validation') {
    const base =
      'A Autentique recusou os dados do envio. Confira os itens abaixo — o mais comum é o mesmo e-mail em dois signatários ou PDF inválido.';
    return detail ? `${base}\n${detail}` : base;
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
  if (lower === 'signer_phone_required_for_whatsapp_sms') {
    return 'Informe um WhatsApp válido para o signatário que receberá o link por WhatsApp.';
  }
  if (lower === 'unavailable_credits') {
    return 'Sua conta Autentique não tem créditos para criar documentos. Verifique o plano ou use modo sandbox (teste).';
  }

  if (detail) return detail;
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
    lower === 'signer_phone_required_for_whatsapp_sms' ||
    lower === 'unavailable_credits' ||
    lower.includes('invalid') ||
    lower.includes('signer')
  );
}
