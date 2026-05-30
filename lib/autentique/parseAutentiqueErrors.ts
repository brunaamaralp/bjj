export type AutentiqueGraphQLError = {
  message?: string;
  path?: Array<string | number>;
  extensions?: {
    validation?: Record<string, string[] | string>;
    category?: string;
  };
};

const VALIDATION_CODE_PT: Record<string, string> = {
  field_required: 'campo obrigatório',
  must_be_a_valid_email_address: 'e-mail inválido',
  must_be_a_string: 'deve ser texto',
  must_be_an_array: 'formato de lista inválido',
  not_a_valid_date: 'data inválida',
  must_be_a_file: 'arquivo inválido',
  failed_to_upload: 'falha ao enviar o PDF',
  could_not_upload_file: 'não foi possível enviar o PDF',
  unavailable_credits: 'sem créditos de documentos no plano Autentique',
  unavailable_verifications_credits: 'sem créditos de verificação na Autentique',
  format_is_invalid: 'formato inválido',
  must_be_a_valid_file: 'tipo de arquivo não permitido',
};

function humanizeValidationField(field: string): string {
  const f = String(field || '').trim();
  const signerMatch = f.match(/signers(?:\.|\[)(\d+)/i);
  const signerIdx = signerMatch ? Number(signerMatch[1]) : null;
  const signerLabel =
    signerIdx != null && Number.isFinite(signerIdx)
      ? `Signatário ${signerIdx + 1}`
      : 'Signatário';

  if (/\.email$/i.test(f) || f.endsWith('email')) return `${signerLabel} — e-mail`;
  if (/\.phone$/i.test(f) || f.endsWith('phone')) return `${signerLabel} — telefone`;
  if (/\.name$/i.test(f) || f.endsWith('name')) return `${signerLabel} — nome`;
  if (/\.positions/i.test(f)) return `${signerLabel} — posição da assinatura`;
  if (/delivery_method/i.test(f)) return `${signerLabel} — canal de envio`;
  if (/^file$/i.test(f) || /\.file$/i.test(f)) return 'Arquivo PDF';
  if (/document\.name/i.test(f)) return 'Nome do documento';
  return f.replace(/\./g, ' → ');
}

function humanizeValidationCode(code: string): string {
  const raw = String(code || '').trim();
  if (!raw) return 'valor inválido';
  if (VALIDATION_CODE_PT[raw]) return VALIDATION_CODE_PT[raw];

  const minMatch = raw.match(/^must_be_at_least_characters:(\d+)$/);
  if (minMatch) return `mínimo de ${minMatch[1]} caracteres`;

  const maxMatch = raw.match(/^may_not_be_greater_than_characters:(\d+)$/);
  if (maxMatch) return `máximo de ${maxMatch[1]} caracteres`;

  return raw.replace(/_/g, ' ');
}

/** Extrai linhas legíveis de errors[].extensions.validation da Autentique. */
export function formatAutentiqueValidationDetail(
  errors: AutentiqueGraphQLError[] | undefined | null
): string {
  if (!Array.isArray(errors) || errors.length === 0) return '';

  const lines: string[] = [];

  for (const err of errors) {
    const validation = err.extensions?.validation;
    if (validation && typeof validation === 'object') {
      for (const [field, codesRaw] of Object.entries(validation)) {
        const codes = Array.isArray(codesRaw) ? codesRaw : [String(codesRaw)];
        const label = humanizeValidationField(field);
        for (const code of codes) {
          lines.push(`${label}: ${humanizeValidationCode(String(code))}`);
        }
      }
      continue;
    }

    const msg = String(err.message || '').trim();
    if (msg && msg.toLowerCase() !== 'validation') {
      lines.push(msg);
    }
  }

  return lines.join('\n');
}

export function firstAutentiqueErrorMessage(
  errors: AutentiqueGraphQLError[] | undefined | null
): string {
  if (!Array.isArray(errors) || !errors.length) return '';
  return String(errors[0]?.message || '').trim();
}
