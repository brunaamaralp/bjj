import type { SignerInput } from './types.js';
import { validateContractSigners, ContractFormError } from './validateContractSigners.js';

export { ContractFormError };
export const MAX_CONTRACT_PDF_BYTES = 10 * 1024 * 1024;

export interface ParsedContractForm {
  name: string;
  signers: SignerInput[];
  template_id: string;
  sandbox: boolean;
  lead_id?: string;
}

function parseSandbox(value: FormDataEntryValue | null): boolean {
  if (value == null) return false;
  const s = String(value).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function parseSignersJson(raw: FormDataEntryValue | null): SignerInput[] {
  if (raw == null || String(raw).trim() === '') {
    throw new ContractFormError('signers é obrigatório');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    throw new ContractFormError('signers deve ser um JSON válido');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new ContractFormError('signers deve ser um array não vazio');
  }
  return parsed as SignerInput[];
}

export type ParseContractFormOptions = {
  /** Quando true, validação de signatários fica a cargo do handler (ex.: após enrich da academia). */
  skipSignerValidation?: boolean;
};

/** Converte FormData (Next.js / Web API) para payload de signContract. */
export async function parseContractFormData(
  formData: FormData,
  opts: ParseContractFormOptions = {}
): Promise<ParsedContractForm> {
  const nameRaw = formData.get('name');
  let name = nameRaw != null ? String(nameRaw).trim() : '';
  if (!name) {
    name = `Contrato ${new Date().toLocaleDateString('pt-BR')}`;
  }

  const signers = parseSignersJson(formData.get('signers'));
  if (!opts.skipSignerValidation) {
    validateContractSigners(signers);
  }

  const templateRaw = formData.get('template_id');
  const template_id = templateRaw != null ? String(templateRaw).trim() : '';
  if (!template_id) {
    throw new ContractFormError('Selecione um modelo de contrato');
  }

  const sandbox = parseSandbox(formData.get('sandbox'));

  const leadRaw = formData.get('lead_id');
  const lead_id =
    leadRaw != null && String(leadRaw).trim() ? String(leadRaw).trim() : undefined;

  return { name, signers, template_id, sandbox, lead_id };
}
