function baseUrl() {
  const url = process.env.ZAPSTER_API_BASE_URL || 'https://api.zapsterapi.com';
  return String(url || '').replace(/\/+$/, '');
}

function zapsterToken() {
  return String(process.env.ZAPSTER_TOKEN || process.env.ZAPSTER_API_TOKEN || '').trim();
}

function normalizeRecipientPhone(v) {
  const raw = String(v || '').trim();
  if (!raw) return '';
  return raw.replace(/[^\d]/g, '');
}

/** Extrai URL de foto de perfil do payload GET /recipients/{recipient}. */
export function pickProfilePictureFromRecipientPayload(data) {
  if (!data || typeof data !== 'object') return '';
  const candidates = [
    data.profile_picture,
    data.profilePicture,
    data.profile_picture_url,
    data.profilePictureUrl,
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}

/**
 * Busca nome e foto de perfil do contato na Zapster (quando o webhook não envia a URL).
 * @returns {Promise<{ profilePicture: string, name: string }>}
 */
export async function fetchZapsterRecipientProfile(instanceId, recipient) {
  const inst = String(instanceId || '').trim();
  const phone = normalizeRecipientPhone(recipient);
  const token = zapsterToken();
  if (!inst || !phone || !token) {
    return { profilePicture: '', name: '' };
  }
  const url = `${baseUrl()}/v1/wa/instances/${encodeURIComponent(inst)}/recipients/${encodeURIComponent(phone)}`;
  try {
    const resp = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000),
    });
    const raw = await resp.text();
    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return { profilePicture: '', name: '' };
    }
    if (!resp.ok) return { profilePicture: '', name: '' };
    return {
      profilePicture: pickProfilePictureFromRecipientPayload(data),
      name: String(data?.name || '').trim(),
    };
  } catch {
    return { profilePicture: '', name: '' };
  }
}

/** Atalho quando só a URL da foto é necessária. */
export async function fetchZapsterRecipientProfilePicture(instanceId, recipient) {
  const { profilePicture } = await fetchZapsterRecipientProfile(instanceId, recipient);
  return profilePicture;
}
