/** Prazo padrão para assinatura (dias) quando a academia não define outro valor. */
export const DEFAULT_CONTRACT_SIGNATURE_DEADLINE_DAYS = 7;

export function resolveSignatureDeadlineDays(academyDoc: Record<string, unknown> | null | undefined): number {
  const raw =
    academyDoc?.contract_signature_deadline_days ??
    academyDoc?.contractSignatureDeadlineDays ??
    process.env.CONTRACT_SIGNATURE_DEADLINE_DAYS;
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 365 ? n : DEFAULT_CONTRACT_SIGNATURE_DEADLINE_DAYS;
}

export function computeContractExpiresAt(
  createdAtIso: string | null | undefined,
  deadlineDays: number
): string | null {
  const base = createdAtIso ? new Date(String(createdAtIso)) : new Date();
  if (!Number.isFinite(base.getTime())) return null;
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + Math.max(1, deadlineDays));
  return d.toISOString();
}

export function isPastIso(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const t = new Date(String(iso)).getTime();
  return Number.isFinite(t) && Date.now() > t;
}
