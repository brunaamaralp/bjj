import { readAutentiqueConfig } from '../autentiqueSettings.js';
import type { ContractSignerLayout } from './contractSignerLayout.js';
import type { SignerInput } from './types.js';

function normalizeEmail(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

function parseAcademySettingsRaw(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** E-mail da conta Autentique (titular do token) — env ou cadastro da academia. */
export function resolveAutentiqueAccountEmail(
  academyDoc?: Record<string, unknown> | null
): string {
  const fromEnv = String(
    process.env.AUTENTIQUE_ACCOUNT_EMAIL ||
      process.env.VITE_AUTENTIQUE_ACCOUNT_EMAIL ||
      ''
  ).trim();

  if (!academyDoc) return fromEnv;

  const direct = String(academyDoc.autentique_account_email || '').trim();
  if (direct) return direct;

  const settingsRaw = academyDoc.settings ?? academyDoc.settings_json;
  const settings = parseAcademySettingsRaw(settingsRaw);
  const fromSettings = String(settings.autentique_account_email || '').trim();
  if (fromSettings) return fromSettings;

  const fromAutentiqueSettings = String(
    readAutentiqueConfig(settingsRaw).account_email || ''
  ).trim();
  return fromAutentiqueSettings || fromEnv;
}

export function maskEmailForDisplay(email: string): string {
  const raw = String(email || '').trim();
  const at = raw.indexOf('@');
  if (at <= 1) return raw ? '•••@•••' : '';
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local[0] || ''}•` : `${local.slice(0, 2)}•••`;
  const dot = domain.indexOf('.');
  const maskedDomain =
    dot > 0 ? `${domain[0]}•••${domain.slice(dot)}` : `${domain[0] || ''}•••`;
  return `${maskedLocal}@${maskedDomain}`;
}

export function contratadaSlotEnabled(layout: ContractSignerLayout | null | undefined): boolean {
  const slots = layout?.slots || [];
  if (slots.length < 2) return false;
  return slots.some(
    (slot, index) =>
      index > 0 &&
      slot.enabled !== false &&
      String(slot.label || '')
        .trim()
        .toLowerCase()
        .includes('contratada')
  );
}

export function findContratadaSignerIndex(
  layout: ContractSignerLayout | null | undefined
): number | null {
  const active = (layout?.slots || []).filter((s) => s.enabled !== false);
  if (active.length < 2) return null;
  const idx = (layout?.slots || []).findIndex(
    (slot, index) =>
      slot.enabled !== false &&
      index > 0 &&
      String(slot.label || '')
        .trim()
        .toLowerCase()
        .includes('contratada')
  );
  if (idx >= 0) return idx;
  return active.length >= 2 ? 1 : null;
}

export type ValidateAcademyAutoSignInput = {
  signers: SignerInput[];
  layout: ContractSignerLayout | null | undefined;
  accountEmail: string;
};

export type ValidateAcademyAutoSignResult =
  | { ok: true; contratadaIndex: number; accountEmail: string }
  | { ok: false; message: string };

export function validateAcademyAutoSign(
  input: ValidateAcademyAutoSignInput
): ValidateAcademyAutoSignResult {
  const accountEmail = normalizeEmail(input.accountEmail);
  if (!accountEmail) {
    return {
      ok: false,
      message:
        'Auto-assinatura não configurada. Informe o e-mail da conta em Integrações → Autentique ou defina AUTENTIQUE_ACCOUNT_EMAIL no servidor (e-mail da conta Autentique do token).',
    };
  }

  if (!contratadaSlotEnabled(input.layout)) {
    return {
      ok: false,
      message: 'Este modelo não exige assinatura da academia (contratada).',
    };
  }

  const contratadaIndex = findContratadaSignerIndex(input.layout);
  if (contratadaIndex == null) {
    return { ok: false, message: 'Não foi possível identificar o signatário contratada.' };
  }

  const signer = input.signers[contratadaIndex];
  const signerEmail = normalizeEmail(signer?.email);
  if (!signerEmail) {
    return {
      ok: false,
      message:
        'Informe o e-mail da contratada (academia). Para auto-assinatura, use o mesmo e-mail da conta Autentique vinculada ao token.',
    };
  }

  if (signerEmail !== accountEmail) {
    return {
      ok: false,
      message: `Auto-assinatura exige que o e-mail da contratada seja o da conta Autentique (${input.accountEmail}).`,
    };
  }

  return { ok: true, contratadaIndex, accountEmail: input.accountEmail };
}

export function signerEmailsMatchContratadaForAutoSign(
  signers: SignerInput[],
  layout: ContractSignerLayout | null | undefined,
  accountEmail: string
): boolean {
  if (!normalizeEmail(accountEmail)) return false;
  const check = validateAcademyAutoSign({ signers, layout, accountEmail });
  return check.ok;
}
