import { inboxProfileImageUrl } from './inboxContactDisplay.js';
import { primaryInboxPhone } from './normalizeInboxPhone.js';

export const AVATAR_BATCH_LIMIT = 10;
export const AVATAR_BATCH_GAP_MS = 250;

export function avatarPhoneKey(phone) {
  return primaryInboxPhone(phone) || String(phone || '').trim();
}

export function itemNeedsAvatar(item) {
  return Boolean(avatarPhoneKey(item?.phone_number)) && !inboxProfileImageUrl(item);
}

export function pickPhonesForAvatarFetch(items, selectedPhone, attemptedSet) {
  const arr = Array.isArray(items) ? items : [];
  const attempted = attemptedSet instanceof Set ? attemptedSet : new Set();
  const out = [];
  const seen = new Set();

  const push = (phone) => {
    const key = avatarPhoneKey(phone);
    if (!key || seen.has(key) || attempted.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  const selectedKey = avatarPhoneKey(selectedPhone);
  if (selectedKey) {
    const row = arr.find((it) => avatarPhoneKey(it?.phone_number) === selectedKey);
    if (!row || itemNeedsAvatar(row)) push(selectedKey);
  }

  for (const it of arr) {
    if (out.length >= AVATAR_BATCH_LIMIT) break;
    const ph = avatarPhoneKey(it?.phone_number);
    if (!ph || !itemNeedsAvatar(it)) continue;
    push(ph);
  }

  return out;
}

export function applyAvatarMap(items, avatars) {
  if (!avatars || typeof avatars !== 'object') return items;
  let changed = false;
  const next = items.map((it) => {
    const ph = avatarPhoneKey(it?.phone_number);
    const url = String(avatars[ph] || '').trim();
    if (!url || String(it?.whatsapp_profile_image_url || '').trim() === url) return it;
    changed = true;
    return { ...it, whatsapp_profile_image_url: url };
  });
  return changed ? next : items;
}

export function applyAvatarToSelected(selected, avatars) {
  if (!selected || typeof selected !== 'object') return selected;
  if (!avatars || typeof avatars !== 'object') return selected;
  const ph = avatarPhoneKey(selected.phone);
  const url = String(avatars[ph] || '').trim();
  if (!url || String(selected.whatsapp_profile_image_url || '').trim() === url) return selected;
  return { ...selected, whatsapp_profile_image_url: url };
}

export function selectedConversationNeedsAvatar(items, selectedPhone) {
  const key = avatarPhoneKey(selectedPhone);
  if (!key) return false;
  const arr = Array.isArray(items) ? items : [];
  const row = arr.find((it) => avatarPhoneKey(it?.phone_number) === key);
  if (row) return itemNeedsAvatar(row);
  return true;
}
