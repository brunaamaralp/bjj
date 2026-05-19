import type { SignerInput } from './types.js';

export interface ParsedContractForm {
  name: string;
  signers: SignerInput[];
  file: Buffer;
  sandbox: boolean;
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

  const fileEntry = formData.get('file');
  if (!fileEntry || typeof fileEntry === 'string') {
    throw new ContractFormError('file (PDF) é obrigatório');
  }

  const file = await fileToBuffer(fileEntry as File | Blob);
  if (!file.length) throw new ContractFormError('file está vazio');

  const sandbox = parseSandbox(formData.get('sandbox'));

  return { name, signers, file, sandbox };
}
