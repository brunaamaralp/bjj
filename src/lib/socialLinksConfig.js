import { parseAcademySettings } from './stockSettings.js';

const EMPTY = { instagram: '', facebook: '', website: '', whatsapp: '' };

export function readSocialLinks(settingsRaw) {
  const settings = parseAcademySettings(settingsRaw);
  const raw = settings?.socialLinks;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...EMPTY };
  }
  return {
    instagram: String(raw.instagram || '').trim(),
    facebook: String(raw.facebook || '').trim(),
    website: String(raw.website || '').trim(),
    whatsapp: String(raw.whatsapp || '').trim(),
  };
}

export function mergeSocialLinksIntoSettings(settingsRaw, links) {
  const base = parseAcademySettings(settingsRaw);
  const next = {
    instagram: String(links?.instagram || '').trim(),
    facebook: String(links?.facebook || '').trim(),
    website: String(links?.website || '').trim(),
    whatsapp: String(links?.whatsapp || '').trim(),
  };
  const hasAny = Object.values(next).some(Boolean);
  if (!hasAny) {
    const { socialLinks: _removed, ...rest } = base;
    return rest;
  }
  return { ...base, socialLinks: next };
}
