import type { ContractTemplatePurpose } from './contractTemplatePurpose.js';

const MAX_DOCUMENT_NAME_LEN = 200;
const MAX_MESSAGE_LEN = 500;

export type BuildAutentiqueDocumentNameInput = {
  academyName?: string | null;
  baseName: string;
};

export type BuildAutentiqueSignerMessageInput = {
  academyName?: string | null;
  purpose?: ContractTemplatePurpose;
};

/** Nome exibido na Autentique (notificação + painel). Evita duplicar o prefixo da academia. */
export function buildAutentiqueDocumentName(input: BuildAutentiqueDocumentNameInput): string {
  const academy = String(input.academyName || '').trim();
  const base = String(input.baseName || '').trim() || 'Contrato';
  if (!academy) return base.slice(0, MAX_DOCUMENT_NAME_LEN);

  const normalizedAcademy = academy.toLowerCase();
  const normalizedBase = base.toLowerCase();
  if (
    normalizedBase === normalizedAcademy ||
    normalizedBase.startsWith(`${normalizedAcademy} —`) ||
    normalizedBase.startsWith(`${normalizedAcademy} -`)
  ) {
    return base.slice(0, MAX_DOCUMENT_NAME_LEN);
  }

  return `${academy} — ${base}`.slice(0, MAX_DOCUMENT_NAME_LEN);
}

/** Mensagem customizada enviada aos signatários (campo `message` da Autentique). */
export function buildAutentiqueSignerMessage(input: BuildAutentiqueSignerMessageInput): string {
  const academy = String(input.academyName || '').trim() || 'A academia';
  const isRescission = input.purpose === 'rescission';
  const docKind = isRescission ? 'termo de rescisão' : 'contrato de matrícula';

  const text = `${academy} enviou este ${docKind} para sua assinatura digital. Abra o link para ler o documento e assinar com segurança pela Autentique.`;
  return text.slice(0, MAX_MESSAGE_LEN);
}
