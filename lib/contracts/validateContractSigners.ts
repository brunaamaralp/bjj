import type { SignerInput } from './types.js';

export class ContractFormError extends Error {
  field?: string;
  statusCode = 400;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ContractFormError';
    this.field = field;
  }
}

function needsPhone(method: string): boolean {
  const m = String(method || '').trim();
  return m === 'DELIVERY_METHOD_WHATSAPP' || m === 'DELIVERY_METHOD_SMS';
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Mesmas regras do superRefine do Zod em contractsSchema (servidor).
 */
export function validateContractSigners(signers: SignerInput[]): void {
  if (!Array.isArray(signers) || signers.length === 0) {
    throw new ContractFormError('Adicione pelo menos um signatário');
  }

  for (let i = 0; i < signers.length; i++) {
    const s = signers[i] || {};
    const name = String(s.name || '').trim();
    if (!name) throw new ContractFormError(`Signatário ${i + 1}: nome obrigatório`);

    const method = String(s.delivery_method || 'DELIVERY_METHOD_EMAIL').trim();
    if (needsPhone(method)) {
      const digits = String(s.phone || '').replace(/\D/g, '');
      if (digits.length < 10) {
        throw new ContractFormError(`Signatário ${i + 1}: telefone obrigatório para WhatsApp/SMS`);
      }
      continue;
    }

    const email = String(s.email || '').trim();
    if (!email) {
      throw new ContractFormError(`Signatário ${i + 1}: e-mail obrigatório para entrega por e-mail`);
    }
    if (!isValidEmail(email)) {
      throw new ContractFormError(`Signatário ${i + 1}: e-mail inválido`);
    }
  }
}
