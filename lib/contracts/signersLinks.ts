import type { AutentiqueDocument } from '../autentique/types.js';
import type { SignerInput } from './types.js';

export interface SignerLinkEntry {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  public_id?: string | null;
  short_link?: string | null;
}

export function buildSignersLinks(
  autentiqueDoc: AutentiqueDocument,
  inputSigners: SignerInput[]
): SignerLinkEntry[] {
  const signatures = autentiqueDoc.signatures || [];
  return signatures.map((sig, index) => {
    const input = inputSigners[index] || {};
    return {
      name: sig.name ?? input.name ?? null,
      email: sig.email ?? input.email ?? null,
      phone: input.phone ?? null,
      public_id: sig.public_id ?? null,
      short_link: sig.link?.short_link ?? null,
    };
  });
}

export function parseSignersLinks(raw: unknown): SignerLinkEntry[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw as SignerLinkEntry[];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as SignerLinkEntry[]) : [];
  } catch {
    return [];
  }
}

export function resolveSignerShortLink(
  signer: { autentiquePublicId?: string | null; email?: string | null; name?: string | null },
  links: SignerLinkEntry[]
): string | null {
  const publicId = signer.autentiquePublicId ? String(signer.autentiquePublicId) : '';
  if (publicId) {
    const byId = links.find((l) => l.public_id && String(l.public_id) === publicId);
    if (byId?.short_link) return String(byId.short_link);
  }

  const email = String(signer.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = links.find((l) => l.email && String(l.email).trim().toLowerCase() === email);
    if (byEmail?.short_link) return String(byEmail.short_link);
  }

  const name = String(signer.name || '').trim().toLowerCase();
  if (name) {
    const byName = links.find((l) => l.name && String(l.name).trim().toLowerCase() === name);
    if (byName?.short_link) return String(byName.short_link);
  }

  return null;
}
