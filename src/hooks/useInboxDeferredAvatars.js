import { useEffect, useRef } from 'react';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { inboxProfileImageUrl } from '../lib/inboxContactDisplay.js';
import { getInboxJwt, safeParseInboxJson } from '../lib/inboxApiUtils.js';
import { primaryInboxPhone } from '../lib/normalizeInboxPhone.js';

const BATCH_LIMIT = 10;
const FETCH_COOLDOWN_MS = 45_000;

function scheduleIdleWork(run, { timeout = 2200, fallbackMs = 500 } = {}) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout });
    return () => cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, fallbackMs);
  return () => window.clearTimeout(id);
}

function avatarKey(phone) {
  return primaryInboxPhone(phone) || String(phone || '').trim();
}

function pickPhonesForAvatarFetch(items, selectedPhone, fetchedSet) {
  const arr = Array.isArray(items) ? items : [];
  const out = [];
  const seen = new Set();

  const push = (phone) => {
    const key = avatarKey(phone);
    if (!key || seen.has(key) || fetchedSet.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  const sel = avatarKey(selectedPhone);
  if (sel) {
    const row = arr.find((it) => avatarKey(it?.phone_number) === sel);
    if (row && !inboxProfileImageUrl(row)) push(sel);
  }

  for (const it of arr) {
    if (out.length >= BATCH_LIMIT) break;
    const ph = avatarKey(it?.phone_number);
    if (!ph || inboxProfileImageUrl(it)) continue;
    push(ph);
  }

  return out;
}

function applyAvatarMap(items, avatars) {
  if (!avatars || typeof avatars !== 'object') return items;
  let changed = false;
  const next = items.map((it) => {
    const ph = avatarKey(it?.phone_number);
    const url = String(avatars[ph] || '').trim();
    if (!url || String(it?.whatsapp_profile_image_url || '').trim() === url) return it;
    changed = true;
    return { ...it, whatsapp_profile_image_url: url };
  });
  return changed ? next : items;
}

/**
 * Busca fotos de perfil em idle após a lista carregar — não bloqueia o bootstrap.
 */
export function useInboxDeferredAvatars({
  academyId,
  items,
  loading,
  selectedPhone,
  setItems,
  setSelected,
}) {
  const fetchedRef = useRef(new Set());
  const lastFetchAtRef = useRef(0);
  const itemsSigRef = useRef('');

  useEffect(() => {
    fetchedRef.current = new Set();
    lastFetchAtRef.current = 0;
    itemsSigRef.current = '';
  }, [academyId]);

  useEffect(() => {
    const aid = String(academyId || '').trim();
    if (!aid || loading) return undefined;

    const sig = `${aid}|${items.length}|${avatarKey(selectedPhone)}`;
    if (sig === itemsSigRef.current) return undefined;
    itemsSigRef.current = sig;

    let cancelled = false;
    const cancelIdle = scheduleIdleWork(() => {
      if (cancelled) return;
      const now = Date.now();
      if (now - lastFetchAtRef.current < FETCH_COOLDOWN_MS && fetchedRef.current.size > 0) return;

      const phones = pickPhonesForAvatarFetch(items, selectedPhone, fetchedRef.current);
      if (!phones.length) return;

      void (async () => {
        for (const p of phones) fetchedRef.current.add(p);
        lastFetchAtRef.current = Date.now();
        try {
          const jwt = await getInboxJwt();
          if (cancelled) return;
          const qs = new URLSearchParams();
          qs.set('avatars', '1');
          qs.set('phones', phones.join(','));
          const { blocked, res } = await fetchWithBillingGuard(`/api/conversations?${qs.toString()}`, {
            headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid },
          });
          if (blocked || !res?.ok || cancelled) return;
          const raw = await res.text();
          const data = safeParseInboxJson(raw) || {};
          const avatars = data?.avatars && typeof data.avatars === 'object' ? data.avatars : {};
          if (!Object.keys(avatars).length) return;

          setItems((prev) => applyAvatarMap(Array.isArray(prev) ? prev : [], avatars));
          if (typeof setSelected === 'function') {
            setSelected((prev) => {
              if (!prev || typeof prev !== 'object') return prev;
              const ph = avatarKey(prev.phone);
              const url = String(avatars[ph] || '').trim();
              if (!url || String(prev.whatsapp_profile_image_url || '').trim() === url) return prev;
              return { ...prev, whatsapp_profile_image_url: url };
            });
          }
        } catch {
          for (const p of phones) fetchedRef.current.delete(p);
        }
      })();
    });

    return () => {
      cancelled = true;
      cancelIdle();
    };
  }, [academyId, items, loading, selectedPhone, setItems, setSelected]);
}
