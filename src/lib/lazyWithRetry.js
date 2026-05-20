import { lazy } from 'react';

const CHUNK_RELOAD_KEY = 'navi-chunk-reload';
const CHUNK_CACHE_PURGE_KEY = 'navi-chunk-cache-purge';

/** Erro típico após deploy: HTML no lugar do .js (chunk antigo / SW desatualizado). */
export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /MIME type/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk \d+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    err?.name === 'ChunkLoadError'
  );
}

function isStaleAssetScriptTarget(target) {
  if (!target || target.tagName !== 'SCRIPT') return false;
  const src = String(target.src || '');
  return src.includes('/assets/') && /\.m?js($|\?)/i.test(src);
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
    sessionStorage.removeItem(CHUNK_CACHE_PURGE_KEY);
  } catch {
    /* ignore */
  }
}

async function purgeWorkboxCaches() {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
}

async function reloadStaleApp({ purgeCaches = false } = {}) {
  if (purgeCaches) {
    try {
      sessionStorage.setItem(CHUNK_CACHE_PURGE_KEY, '1');
    } catch {
      /* ignore */
    }
    await purgeWorkboxCaches();
    try {
      const reg = await navigator.serviceWorker?.getRegistration?.();
      await reg?.update?.();
    } catch {
      /* ignore */
    }
  } else {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') {
        if (sessionStorage.getItem(CHUNK_CACHE_PURGE_KEY) === '1') return false;
        return reloadStaleApp({ purgeCaches: true });
      }
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
    } catch {
      return false;
    }
  }
  window.location.reload();
  return true;
}

/**
 * React.lazy com reload quando o chunk hashed não existe mais (pós-deploy).
 */
export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const mod = await importer();
      clearChunkReloadFlag();
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && (await reloadStaleApp())) {
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

export function installChunkLoadRecovery() {
  const onRejection = (event) => {
    if (!isChunkLoadError(event.reason)) return;
    event.preventDefault();
    void reloadStaleApp();
  };

  const onError = (event) => {
    const target = event?.target;
    if (!isStaleAssetScriptTarget(target)) return;
    event.preventDefault();
    void reloadStaleApp();
  };

  window.addEventListener('unhandledrejection', onRejection);
  window.addEventListener('error', onError, true);
  return () => {
    window.removeEventListener('unhandledrejection', onRejection);
    window.removeEventListener('error', onError, true);
  };
}
