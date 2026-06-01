import type { SignerInput } from './types.js';
import { ContractFormError } from './validateContractSigners.js';
import { isValidBrazilMobilePhone } from './normalizePhone.js';

function usesPhoneDelivery(method: string | undefined): boolean {
  const m = String(method || '').trim();
  return m === 'DELIVERY_METHOD_WHATSAPP' || m === 'DELIVERY_METHOD_SMS';
}

/**
 * Regras que a Autentique costuma rejeitar com `message: "validation"` sem detalhe claro.
 */
export function validateSignersForAutentique(signers: SignerInput[]): void {
  const emails = new Map<string, number>();

  for (let i = 0; i < signers.length; i++) {
    const s = signers[i] || {};
    const method = String(s.delivery_method || '').trim();
    const email = String(s.email || '').trim().toLowerCase();

    if (email && !usesPhoneDelivery(method)) {
      const prev = emails.get(email);
      if (prev != null) {
        throw new ContractFormError(
          `Signatários ${prev + 1} e ${i + 1} usam o mesmo e-mail (${String(s.email).trim()}). ` +
            'A Autentique exige um e-mail diferente para cada parte — use o e-mail do aluno em um e o da academia no outro.'
        );
      }
      emails.set(email, i);
    }

    if (!usesPhoneDelivery(method) && !email) {
      throw new ContractFormError(
        `Signatário ${i + 1}: informe o e-mail ou troque o envio para WhatsApp.`
      );
    }

    if (usesPhoneDelivery(method)) {
      const phone = String(s.phone || '').trim();
      if (!phone) {
        throw new ContractFormError(
          `Signatário ${i + 1}: informe o celular ou troque o canal para E-mail (o e-mail preenchido não é usado no WhatsApp).`
        );
      }
      if (!isValidBrazilMobilePhone(phone)) {
        const channel = method === 'DELIVERY_METHOD_SMS' ? 'SMS' : 'WhatsApp';
        throw new ContractFormError(
          `Signatário ${i + 1}: celular inválido para ${channel} na Autentique. Use DDD + 9 dígitos (ex.: (19) 99999-9999).`
        );
      }
    }
  }
}
