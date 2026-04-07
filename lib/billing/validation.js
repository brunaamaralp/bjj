/**
 * Remove máscara e mantém apenas dígitos.
 * @param {string} s
 */
export function digitsOnly(s) {
  return String(s || '').replace(/\D/g, '');
}

/**
 * @param {string} cpf
 */
function validateCpfDigits(cpf) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf[10], 10);
}

/**
 * @param {string} cnpj
 */
function validateCnpjDigits(cnpj) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += parseInt(cnpj[i], 10) * w1[i];
  let d1 = sum % 11;
  d1 = d1 < 2 ? 0 : 11 - d1;
  if (d1 !== parseInt(cnpj[12], 10)) return false;
  sum = 0;
  for (let i = 0; i < 13; i++) sum += parseInt(cnpj[i], 10) * w2[i];
  let d2 = sum % 11;
  d2 = d2 < 2 ? 0 : 11 - d2;
  return d2 === parseInt(cnpj[13], 10);
}

/**
 * Valida CPF ou CNPJ (somente dígitos após sanitizar).
 * @param {string} raw
 * @returns {{ ok: true, digits: string } | { ok: false, error: string }}
 */
export function validateCpfCnpj(raw) {
  const digits = digitsOnly(raw);
  if (digits.length === 11) {
    if (!validateCpfDigits(digits)) return { ok: false, error: 'CPF inválido.' };
    return { ok: true, digits };
  }
  if (digits.length === 14) {
    if (!validateCnpjDigits(digits)) return { ok: false, error: 'CNPJ inválido.' };
    return { ok: true, digits };
  }
  return { ok: false, error: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.' };
}

/**
 * CEP brasileiro: 8 dígitos.
 * @param {string} raw
 */
export function validateCep(raw) {
  const d = digitsOnly(raw);
  if (d.length !== 8) return { ok: false, error: 'CEP deve ter 8 dígitos.' };
  return { ok: true, digits: d };
}

/**
 * Número do endereço — não vazio, caracteres razoáveis.
 * @param {string} raw
 */
export function validateAddressNumber(raw) {
  const s = String(raw || '').trim();
  if (!s) return { ok: false, error: 'Número do endereço é obrigatório.' };
  if (s.length > 20) return { ok: false, error: 'Número do endereço muito longo.' };
  return { ok: true, value: s };
}

/**
 * Payload de faturamento para checkout Asaas.
 * @typedef {object} BillingCustomerInput
 * @property {string} name
 * @property {string} email
 * @property {string} cpfCnpj
 * @property {string} [phone]
 * @property {string} postalCode
 * @property {string} address
 * @property {string} addressNumber
 * @property {string} [complement]
 * @property {string} uf — estado (2 letras), enviado como province no Asaas
 * @property {string} [neighborhood] — bairro (opcional, vai no complemento)
 * @property {string} city
 */

/**
 * @param {Partial<BillingCustomerInput>} c
 * @returns {{ ok: true, customer: object } | { ok: false, error: string }}
 */
export function validateBillingCustomer(c) {
  const name = String(c?.name || '').trim();
  const email = String(c?.email || '').trim();
  if (!name) return { ok: false, error: 'Nome é obrigatório.' };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'E-mail inválido.' };
  }
  const cpf = validateCpfCnpj(c?.cpfCnpj || '');
  if (!cpf.ok) return cpf;
  const cep = validateCep(c?.postalCode || '');
  if (!cep.ok) return cep;
  const num = validateAddressNumber(c?.addressNumber || '');
  if (!num.ok) return num;
  const address = String(c?.address || '').trim();
  if (!address || address.length < 3) return { ok: false, error: 'Endereço (logradouro) inválido.' };
  const uf = String(c?.uf || c?.province || '')
    .trim()
    .toUpperCase();
  if (uf.length !== 2 || !/^[A-Z]{2}$/.test(uf)) {
    return { ok: false, error: 'UF inválida (informe 2 letras, ex.: SP).' };
  }
  const neighborhood = String(c?.neighborhood || '').trim();
  const city = String(c?.city || '').trim();
  if (!city || city.length < 2) return { ok: false, error: 'Cidade inválida.' };
  const phone = digitsOnly(c?.phone || '');
  const baseComp = String(c?.complement || '').trim();
  const complement = [neighborhood, baseComp].filter(Boolean).join(' — ') || '';
  const customer = {
    name,
    email,
    cpfCnpj: cpf.digits,
    postalCode: cep.digits,
    address,
    addressNumber: num.value,
    complement,
    province: uf,
    city,
  };
  if (phone.length >= 10) {
    customer.phone = phone;
  }
  return { ok: true, customer };
}
