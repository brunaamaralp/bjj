import type { SignerInput } from './types.js';

export const MAX_CONTRACT_PDF_BYTES = 10 * 1024 * 1024;

export interface ParsedContractForm {
  name: string;
  signers: SignerInput[];
  file?: Buffer;
  template_id?: string;
  sandbox: boolean;
  lead_id?: string;
}

export class ContractFormError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ContractFormError';
  }
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

async function fileToBuffer(file: File | Blob): Promise<Buffer> {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Converte FormData (Next.js / Web API) para payload de signContract. */
export async function parseContractFormData(formData: FormData): Promise<ParsedContractForm> {
  const nameRaw = formData.get('name');
  const name = nameRaw != null ? String(nameRaw).trim() : '';
  if (!name) throw new ContractFormError('name é obrigatório');

  const signers = parseSignersJson(formData.get('signers'));

  const templateRaw = formData.get('template_id');
  const template_id =
    templateRaw != null && String(templateRaw).trim() ? String(templateRaw).trim() : undefined;

  const fileEntry = formData.get('file');
  let file: Buffer | undefined;
  if (fileEntry && typeof fileEntry !== 'string') {
    file = await fileToBuffer(fileEntry as File | Blob);
    if (!file.length) throw new ContractFormError('file está vazio');
    if (file.length > MAX_CONTRACT_PDF_BYTES) {
      throw new ContractFormError('PDF muito grande. Tamanho máximo: 10 MB.');
    }
  }

  if (!file && !template_id) {
    throw new ContractFormError('Informe um PDF ou selecione um modelo de contrato');
  }

  const sandbox = parseSandbox(formData.get('sandbox'));

  const leadRaw = formData.get('lead_id');
  const lead_id =
    leadRaw != null && String(leadRaw).trim() ? String(leadRaw).trim() : undefined;

  return { name, signers, file, template_id, sandbox, lead_id };
}
