import { maskPhone } from './masks.js';
import {
  getBrazilMobileNational,
  isValidBrazilMobilePhone,
} from '../../lib/contracts/normalizePhone.js';

export function nationalPhoneDigits(phone) {
  return getBrazilMobileNational(phone);
}

export function formatEmailForSignerField(email) {
  return String(email ?? '').trim();
}

export function formatPhoneForSignerField(phone) {
  const d = nationalPhoneDigits(phone);
  if (!d) return '';
  return maskPhone(d);
}

export function phoneAutentiquePreview(phone) {
  const d = nationalPhoneDigits(phone);
  if (!isValidBrazilMobilePhone(d)) return '';
  return `+55${d}`;
}

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
  const phoneOk = isValidBrazilMobilePhone(lead.phone);

  return {
    name: String(lead.name || '').trim(),
    email: leadEmail,
    phone: leadPhone,
    action: 'SIGN',
    delivery_method: leadEmail
      ? 'DELIVERY_METHOD_EMAIL'
      : phoneOk
        ? 'DELIVERY_METHOD_WHATSAPP'
        : 'DELIVERY_METHOD_EMAIL',
  };
}
