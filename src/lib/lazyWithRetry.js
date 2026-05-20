import { lazy } from 'react';

const CHUNK_RELOAD_KEY = 'navi-chunk-reload';

/** Erro típico após deploy: HTML no lugar do .js (chunk antigo / SW desatualizado). */
export function isChunkLoadError(err) {
  const msg = String(err?.message || err || '');
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /MIME type/i.test(msg) ||
    /ChunkLoadError/i.test(msg) ||
    err?.name === 'ChunkLoadError'
  );
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

function reloadOnceForStaleChunk() {
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1') return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * React.lazy com reload único quando o chunk hashed não existe mais (pós-deploy).
 */
export function lazyWithRetry(importer) {
  return lazy(async () => {
    try {
      const mod = await importer();
      clearChunkReloadFlag();
      return mod;
    } catch (err) {
      if (isChunkLoadError(err) && reloadOnceForStaleChunk()) {
        return new Promise(() => {});
      }
      throw err;
    }
  });
}

export function installChunkLoadRecovery() {
  const onRejection = (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (reloadOnceForStaleChunk()) {
      event.preventDefault();
    }
  };
  window.addEventListener('unhandledrejection', onRejection);
  return () => window.removeEventListener('unhandledrejection', onRejection);
}
