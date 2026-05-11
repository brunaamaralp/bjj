/**
 * Extrai URL pública da foto de perfil do contato em payloads Zapster (webhook / listagem).
 * Campos variam por versão da API; mantemos vários candidatos.
 */
export function pickSenderProfileImageUrl(v) {
  if (!v || typeof v !== 'object') return '';
  const s = v.sender && typeof v.sender === 'object' ? v.sender : {};
  const candidates = [
    s.profile_picture_url,
    s.profilePictureUrl,
    s.profile_pic_url,
    s.profilePicUrl,
    s.picture,
    s.avatar,
    s.image,
    s.photo,
    s.profile_picture,
    v.sender_profile_picture_url,
    v.senderProfilePictureUrl,
    v.profile_picture_url,
    v.profilePictureUrl,
    v.contact?.profile_picture_url,
    v.contact?.profilePictureUrl
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}
