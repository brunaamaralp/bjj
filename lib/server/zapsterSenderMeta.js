/**
 * Extrai URL pública da foto de perfil do contato em payloads Zapster (webhook / listagem).
 * Campos variam por versão da API; mantemos vários candidatos.
 */
export function pickSenderProfileImageUrl(v) {
  if (!v || typeof v !== 'object') return '';
  const s = v.sender && typeof v.sender === 'object' ? v.sender : {};
  const c = v.contact && typeof v.contact === 'object' ? v.contact : {};
  const candidates = [
    s.profile_picture_url,
    s.profilePictureUrl,
    s.profile_pic_url,
    s.profilePicUrl,
    s.profile_picture,
    s.profilePicture,
    s.picture,
    s.avatar,
    s.image,
    s.photo,
    v.sender_profile_picture_url,
    v.senderProfilePictureUrl,
    v.sender_profile_picture,
    v.senderProfilePicture,
    v.profile_picture_url,
    v.profilePictureUrl,
    v.profile_picture,
    v.profilePicture,
    c.profile_picture_url,
    c.profilePictureUrl,
    c.profile_picture,
    c.profilePicture,
    c.picture,
    c.avatar,
  ];
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (u && /^https?:\/\//i.test(u)) return u;
  }
  return '';
}
