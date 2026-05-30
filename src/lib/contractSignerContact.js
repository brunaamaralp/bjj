import { maskPhone } from './masks.js';

/** Apenas dígitos do celular BR (11), sem código do país. */
export function nationalPhoneDigits(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  return d.slice(0, 11);
}

/** E-mail do cadastro, pronto para o formulário de signatário. */
export function formatEmailForSignerField(email) {
  return String(email ?? '').trim();
}

/** Telefone do cadastro no formato exibido no app: (DD) 99999-9999 */
export function formatPhoneForSignerField(phone) {
  const d = nationalPhoneDigits(phone);
  if (!d) return '';
  return maskPhone(d);
}

/** Como o número será enviado à Autentique (+55 + 11 dígitos). */
export function phoneAutentiquePreview(phone) {
  const d = nationalPhoneDigits(phone);
  if (d.length < 10) return '';
  return `+55${d}`;
}

/**
 * Signatário principal (aluno) a partir do lead/aluno no store.
 * @param {object | null | undefined} lead
 */
export function buildPrimarySignerFromLead(lead) {
  if (!lead) {
    return {
      name: '',
      email: '',
      phone: '',
      action: 'SIGN',
      delivery_method: 'DELIVERY_METHOD_EMAIL',
    };
  }

  const leadEmail = formatEmailForSignerField(lead.email);
  const leadPhone = formatPhoneForSignerField(lead.phone);
  const phoneDigits = nationalPhoneDigits(lead.phone);

  return {
    name: String(lead.name || '').trim(),
    email: leadEmail,
    phone: leadPhone,
    action: 'SIGN',
    delivery_method: leadEmail
      ? 'DELIVERY_METHOD_EMAIL'
      : phoneDigits.length >= 10
        ? 'DELIVERY_METHOD_WHATSAPP'
        : 'DELIVERY_METHOD_EMAIL',
  };
}
