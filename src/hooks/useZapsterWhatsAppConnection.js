import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { account, realtime, ACADEMIES_COL, DB_ID } from '../lib/appwrite';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useUiStore } from '../store/useUiStore';
import { normalizeWaPhoneDigits } from '../../lib/zapsterInstancePhone.js';

function waPhoneForStatus(status, phoneRaw, prevPhone) {
  const st = String(status || '').trim().toLowerCase();
  if (st !== 'connected' && st !== 'online') return null;
  return normalizeWaPhoneDigits(phoneRaw || '') || prevPhone || null;
}

function waInfoSnapshotEqual(a, b) {
  return (
    a.instance_id === b.instance_id &&
    a.status === b.status &&
    a.qrcode === b.qrcode &&
    a.phone === b.phone
  );
}

async function getJwt() {
  const jwt = await account.createJWT();
  return String(jwt?.jwt || '').trim();
}

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isZapsterTokenMissingPayload(data) {
  return Boolean(data && typeof data === 'object' && data.codigo === 'ZAPSTER_TOKEN_MISSING');
}

function normalizeApiError(raw, fallback) {
  const s = String(raw || '').trim();
  if (!s) return fallback;
  const parsed = safeParseJson(s);
  if (parsed && typeof parsed === 'object') {
    if (parsed.codigo === 'zapster_timeout') {
      return 'Zapster não respondeu. Tente novamente em alguns instantes.';
    }
    if (typeof parsed.erro === 'string' && parsed.erro.trim()) return parsed.erro.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  }
  if (s === 'zapster_timeout' || /zapster\s+n[aã]o\s+respondeu/i.test(s)) {
    return 'Zapster não respondeu. Tente novamente em alguns instantes.';
  }
  return s;
}

function resolveWaStatus(academyZapsterStatus, apiStatus, instanceId) {
  const docSt = String(academyZapsterStatus || '').trim().toLowerCase();
  const apiSt = String(apiStatus || '').trim().toLowerCase();
  const hasInstance = Boolean(String(instanceId || '').trim());
  if (docSt) return docSt;
  if (!hasInstance) return 'disconnected';
  return apiSt || 'disconnected';
}

/** Texto agregado de campos de erro para matching (case-insensitive nos testes). */
function collectWaApiErrorText(data, raw) {
  const parts = [];
  if (data && typeof data === 'object') {
    for (const k of ['erro', 'error', 'message', 'detalhe', 'codigo']) {
      const v = data[k];
      if (typeof v === 'string' && v.trim()) parts.push(v);
    }
  }
  if (typeof raw === 'string' && raw.trim()) parts.push(raw);
  return parts.join(' ').toLowerCase();
}

/**
 * Instância sumiu na Zapster mas o Appwrite ainda tem instance_id (ou a API devolveu erro explícito).
 */
function isWaStatusAwaitingQr(status) {
  const k = String(status || '').trim().toLowerCase();
  return ['qrcode', 'scanning', 'open'].includes(k);
}

function waSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isInstanceNotFoundResponse(resp, data, raw) {
  if (resp && Number(resp.status) === 404) return true;
  const text = collectWaApiErrorText(data, raw);
  if (!text.trim()) return false;
  return (
    /instance\s*not\s*found/.test(text) ||
    /\bnot\s+found\b/.test(text) ||
    /instance_not_found/.test(text) ||
    /inst\u00e2ncia\s+n\u00e3o\s+encontrada/.test(text) ||
    /instancia\s+nao\s+encontrada/.test(text)
  );
}

async function clearStaleZapsterLinkInAppwrite(jwt, academyId) {
  const aid = String(academyId || '').trim();
  if (!aid) return;
  const { blocked, res } = await fetchWithBillingGuard('/api/zapster/instances?action=clear-local-link', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'x-academy-id': aid,
      'content-type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (blocked || !res || !res.ok) {
    try {
      await res?.text();
    } catch {
      void 0;
    }
  }
}

/**
 * Quando GET /instances reporta "connected", o GET do PNG do QR funciona como prova de vida:
 * — 200 + imagem: ainda é possível exibir QR (sessão WA não está estável como conectada no painel).
 * — 406: QR indisponível (típico com sessão ativa) → confiar no status "connected".
 * — Outros erros: tratar como possível dessincronia e permitir fluxo de reconexão.
 * @returns {Promise<boolean>} true se o status reportado como connected deve ser forçado para disconnected
 */
async function shouldOverrideConnectedStatusAfterQrProbe(academyId, jwt, instanceId) {
  const id = String(instanceId || '').trim();
  const aid = String(academyId || '').trim();
  if (!id || !aid) return false;

  const { blocked, res } = await fetchWithBillingGuard(
    `/api/zapster/instances?action=qrcode&id=${encodeURIComponent(id)}&ts=${Date.now()}`,
    { headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': aid } }
  );
  if (blocked || !res) return false;

  if (res.ok) {
    const ct = String(res.headers.get('content-type') || '');
    try {
      await res.arrayBuffer();
    } catch {
      void 0;
    }
    if (ct.includes('image/png') || ct.includes('image/')) return true;
    return false;
  }

  if (res.status === 406) {
    try {
      await res.arrayBuffer();
    } catch {
      void 0;
    }
    return false;
  }

  try {
    await res.text();
  } catch {
    void 0;
  }
  return true;
}

function inboxDebugEnabled() {
  const envEnabled =
    import.meta.env.DEV ||
    ['1', 'true', 'yes'].includes(String(import.meta.env.VITE_INBOX_DEBUG || '').trim().toLowerCase());
  if (envEnabled) return true;
  if (typeof window === 'undefined') return false;
  try {
    const local = String(window.localStorage?.getItem('inbox_debug') || '').trim().toLowerCase();
    return local === '1' || local === 'true' || local === 'yes';
  } catch {
    return false;
  }
}

/**
 * Estado e ações Zapster/WhatsApp compartilhadas entre Inbox (só leitura) e Agente IA (QR manual).
 * @param {string} academyId
 * @param {{
 *   onRegisterWebhooksResult?: (r: { ok: boolean }) => void,
 *   statusPollWhileMounted?: boolean,
 *   watchAcademyStatus?: boolean,
 * }} [options]
 */
export function useZapsterWhatsAppConnection(academyId, options = {}) {
  const academyIdRef = useRef('');
  const onRegisterWebhooksResultRef = useRef(options?.onRegisterWebhooksResult);
  const waPersistFailedRef = useRef(false);
  const isCreatingRef = useRef(false);
  const isFetchingWaInfoRef = useRef(false);
  const waInfoRef = useRef({ instance_id: null, status: 'disconnected', qrcode: null, phone: null });
  const hookMountedRef = useRef(true);
  const deferredTimersRef = useRef([]);

  useEffect(() => {
    onRegisterWebhooksResultRef.current = options?.onRegisterWebhooksResult;
  }, [options?.onRegisterWebhooksResult]);
  const [waLoading, setWaLoading] = useState(false);
  const [waInfo, setWaInfo] = useState({ instance_id: null, status: 'disconnected', qrcode: null, phone: null });
  const [waTokenMissing, setWaTokenMissing] = useState(false);
  const [waQrError, setWaQrError] = useState(false);
  const [waQrTick, setWaQrTick] = useState(0);
  /** Só carrega a imagem do QR depois que o usuário pede (evita leitura/disparos automáticos). */
  const [waQrShown, setWaQrShown] = useState(false);
  /** Após o primeiro erro ao carregar a imagem do QR, exibe o botão "Gerar novo QR". */
  const [waQrLoadFailedOnce, setWaQrLoadFailedOnce] = useState(false);
  const [waSyncing, setWaSyncing] = useState(false);
  const [waPersistFailed, setWaPersistFailed] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [academyWaStatus, setAcademyWaStatus] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    academyIdRef.current = String(academyId || '').trim();
  }, [academyId]);

  useEffect(() => {
    waPersistFailedRef.current = waPersistFailed;
  }, [waPersistFailed]);

  useEffect(() => {
    waInfoRef.current = waInfo;
  }, [waInfo]);

  /** Instância órfã (Zapster sem o id): limpa UI sem toast nem connectionError. */
  const resetWaToNoInstanceSilently = useCallback(() => {
    setWaPersistFailed(false);
    setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null, phone: null });
    setAcademyWaStatus('disconnected');
    setWaTokenMissing(false);
    setWaQrError(false);
    setWaQrShown(false);
    setWaQrLoadFailedOnce(false);
    setWaQrTick(0);
    setConnectionError('');
  }, []);

  const registerWebhooks = useCallback(async (instanceId) => {
    const debugOn = inboxDebugEnabled();
    const id = String(instanceId || '').trim();
    const aid = String(academyIdRef.current || '').trim();
    if (!id || !aid) return;

    let storageKey = '';
    try {
      if (typeof window === 'undefined') return;
      storageKey = `nave_webhooks_registered_${id}`;
      if (window.localStorage.getItem(storageKey) === '1') return;
    } catch {
      void 0;
    }

    try {
      const jwt = await getJwt();
      const host = typeof window !== 'undefined' ? String(window.location.host || '').trim() : '';
      if (debugOn) {
        console.log('[WA Debug] registerWebhooks request', { instanceId: id, academyId: aid, host });
      }
      const { blocked, res } = await fetchWithBillingGuard('/api/zapster/instances?action=register-webhooks', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': aid,
          'content-type': 'application/json'
        },
        body: JSON.stringify({ instanceId: id, ...(host ? { host } : {}) })
      });

      const cb = onRegisterWebhooksResultRef.current;
      if (blocked || !res) {
        if (debugOn) {
          console.warn('[WA Debug] registerWebhooks blocked/no-response', { blocked, hasResponse: Boolean(res) });
        }
        cb?.({ ok: false });
        return;
      }

      if (res.ok) {
        try {
          if (storageKey && typeof window !== 'undefined') {
            window.localStorage.setItem(storageKey, '1');
          }
        } catch {
          void 0;
        }
        if (debugOn) {
          console.log('[WA Debug] registerWebhooks success', { instanceId: id, status: res.status });
        }
        cb?.({ ok: true });
        return;
      }

      if (debugOn) {
        console.warn('[WA Debug] registerWebhooks non-ok', { instanceId: id, status: res.status });
      }
      cb?.({ ok: false });
    } catch (e) {
      if (debugOn) {
        console.error('[WA Debug] registerWebhooks exception', e);
      }
      onRegisterWebhooksResultRef.current?.({ ok: false });
    }
  }, []);

  const fetchWaInfo = useCallback(async ({ silent = false, quiet = false } = {}) => {
    const debugOn = inboxDebugEnabled();
    const aid = String(academyIdRef.current || '').trim();
    if (debugOn) {
      console.debug('[WA] fetchWaInfo requested', {
        alreadyFetching: isFetchingWaInfoRef.current,
        academyId: aid
      });
    }
    if (!aid) return;
    if (isFetchingWaInfoRef.current) return;
    isFetchingWaInfoRef.current = true;
    if (!silent) setConnectionError('');
    if (!quiet) setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/zapster/instances', {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (blocked) return;
      const raw = await resp.text();
      const data = safeParseJson(raw) || {};
      if (!resp.ok) {
        if (isZapsterTokenMissingPayload(data)) setWaTokenMissing(true);
        if (isInstanceNotFoundResponse(resp, data, raw)) {
          await clearStaleZapsterLinkInAppwrite(jwt, academyIdRef.current);
          resetWaToNoInstanceSilently();
          return;
        }
        throw new Error(normalizeApiError(raw, String(data.erro || '').trim() || 'Falha ao consultar WhatsApp'));
      }
      const incomingId = data?.instance_id ?? null;
      let status = String(data?.status || '').trim() || 'unknown';
      let qrcode = data?.qrcode ?? null;
      let waPhoneFromApi = normalizeWaPhoneDigits(data?.wa_phone || '');
      const zapsterStatusFromApi = String(data?.zapster_status || '').trim();
      if (zapsterStatusFromApi) {
        setAcademyWaStatus(zapsterStatusFromApi);
      }

      if (incomingId && status.toLowerCase() === 'unknown') {
        const { blocked: probeBlocked, res: probeResp } = await fetchWithBillingGuard(
          `/api/zapster/instances?action=get&id=${encodeURIComponent(incomingId)}`,
          { headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') } }
        );
        if (!probeBlocked && probeResp) {
          const probeRaw = await probeResp.text();
          const probeData = safeParseJson(probeRaw) || {};
          if (
            !probeResp.ok &&
            (probeResp.status === 404 || isInstanceNotFoundResponse(probeResp, probeData, probeRaw))
          ) {
            await clearStaleZapsterLinkInAppwrite(jwt, academyIdRef.current);
            resetWaToNoInstanceSilently();
            return;
          }
          if (probeResp.ok && probeData && typeof probeData === 'object' && probeData.sucesso !== false) {
            const st = String(probeData.status || '').trim();
            if (st) {
              status = st;
              qrcode = probeData.qrcode ?? null;
            }
            if (probeData.wa_phone) {
              waPhoneFromApi = normalizeWaPhoneDigits(probeData.wa_phone) || waPhoneFromApi;
            }
          }
        }
      }

      if (incomingId && status === 'connected') {
        const stale = await shouldOverrideConnectedStatusAfterQrProbe(academyIdRef.current, jwt, incomingId);
        if (stale) {
          status = 'disconnected';
          qrcode = null;
        }
      }

      const finalStatus = status;
      const finalQrcode = qrcode;
      setWaInfo((prev) => {
        if (incomingId) {
          const next = {
            instance_id: incomingId,
            status: finalStatus,
            qrcode: finalQrcode,
            phone: waPhoneForStatus(finalStatus, waPhoneFromApi, prev.phone),
          };
          if (waInfoSnapshotEqual(prev, next)) return prev;
          return next;
        }
        if (waPersistFailedRef.current && prev.instance_id) {
          const next = {
            ...prev,
            status: finalStatus,
            qrcode: finalQrcode,
            phone: waPhoneForStatus(finalStatus, waPhoneFromApi, prev.phone),
          };
          if (waInfoSnapshotEqual(prev, next)) return prev;
          return next;
        }
        const empty = { instance_id: null, status: 'disconnected', qrcode: null, phone: null };
        if (waInfoSnapshotEqual(prev, empty)) return prev;
        return empty;
      });
      if (incomingId) {
        setWaPersistFailed(false);
      }
      setWaTokenMissing(false);
      if (finalStatus === 'connected') {
        setWaQrError(false);
        setWaQrShown(false);
        setWaQrLoadFailedOnce(false);
      } else {
        setWaQrError(false);
      }
      if (debugOn) {
        console.log('[WA Debug] fetchWaInfo final', {
          academyId: String(academyIdRef.current || '').trim(),
          instanceId: incomingId,
          status: finalStatus,
          hasQr: Boolean(finalQrcode),
          silent,
          quiet
        });
      }

      if (incomingId && String(finalStatus || '').trim().toLowerCase() === 'connected') {
        void registerWebhooks(incomingId);
      }
    } catch (e) {
      if (debugOn) {
        console.error('[WA Debug] fetchWaInfo exception', e);
      }
      const msg = String(e?.message || '');
      if (
        msg.toLowerCase().includes('zapster_api_token') ||
        msg.toLowerCase().includes('zapster_token_missing') ||
        (msg.toLowerCase().includes('serviço de whatsapp') && msg.toLowerCase().includes('não configurado'))
      ) {
        setWaTokenMissing(true);
      }
      if (!silent) setConnectionError(msg || 'Erro');
    } finally {
      isFetchingWaInfoRef.current = false;
      if (!quiet) setWaLoading(false);
    }
  }, [resetWaToNoInstanceSilently, registerWebhooks]);

  const createWaInstance = useCallback(async () => {
    if (!academyIdRef.current) return;
    if (isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true);
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      // Fluxo ideal: antes de criar nova instância, tenta recuperar vínculo existente.
      try {
        const { blocked: recoverBlocked, res: recoverResp } = await fetchWithBillingGuard('/api/zapster/instances?action=recover', {
          headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
        });
        if (recoverBlocked) return;
        const recoverRaw = await recoverResp.text();
        const recoverData = safeParseJson(recoverRaw) || {};
        if (recoverResp.ok && (recoverData.recovered || recoverData.already_linked)) {
          setWaPersistFailed(false);
          await fetchWaInfo({ silent: true });
          useUiStore.getState().addToast({
            type: 'success',
            message: recoverData.recovered ? 'Conexão do WhatsApp recuperada com sucesso!' : 'WhatsApp já estava vinculado.'
          });
          return;
        }
      } catch {
        // Se recover falhar por rede/serviço, segue para tentativa de criação.
      }

      const { blocked, res: resp } = await fetchWithBillingGuard('/api/zapster/instances', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          host: typeof window !== 'undefined' ? String(window.location.host || '').trim() : ''
        })
      });
      if (blocked) return;
      const raw = await resp.text();
      const data = safeParseJson(raw) || {};
      if (!resp.ok || data.sucesso === false) {
        if (isZapsterTokenMissingPayload(data)) setWaTokenMissing(true);
        const message = String(data.erro || '').trim() || normalizeApiError(raw, 'Erro ao conectar dispositivo');
        useUiStore.getState().addToast({ type: 'error', message });
        setConnectionError(message);
        return;
      }
      const instance_id = data?.instance_id || null;
      const status = String(data?.status || '').trim() || 'unknown';
      const qrcode = data?.qrcode ?? null;
      const phone = waPhoneForStatus(status, data?.wa_phone, null);
      setWaInfo({ instance_id, status, qrcode, phone });
      if (data.persist_failed) {
        setWaPersistFailed(true);
        useUiStore.getState().addToast({
          type: 'warning',
          message: String(data.aviso || 'Conexão criada, mas falhou salvar no sistema. Use Verificar e corrigir.')
        });
      } else {
        setWaPersistFailed(false);
        useUiStore.getState().addToast({ type: 'success', message: 'Preparando conexão do WhatsApp' });
      }
      setWaTokenMissing(false);
      setWaQrError(false);
      setWaQrLoadFailedOnce(false);
      setWaQrShown(true);
      setWaQrTick((v) => v + 1);
    } catch (e) {
      const msg = String(e?.message || '');
      if (
        msg.toLowerCase().includes('zapster_api_token') ||
        msg.toLowerCase().includes('zapster_token_missing') ||
        (msg.toLowerCase().includes('serviço de whatsapp') && msg.toLowerCase().includes('não configurado'))
      ) {
        setWaTokenMissing(true);
      }
      setConnectionError(msg || 'Erro');
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
      setWaLoading(false);
    }
  }, [fetchWaInfo]);

  const revealWaQrCode = useCallback(async () => {
    if (!academyIdRef.current) return;
    setWaQrShown(true);
    setWaQrError(false);
    setWaQrLoadFailedOnce(false);
    setConnectionError('');
    setWaLoading(true);
    try {
      await fetchWaInfo({ silent: true, quiet: true });
      const st = String(waInfoRef.current?.status || '').trim().toLowerCase();
      if (st === 'connected') {
        useUiStore.getState().addToast({
          type: 'info',
          message: 'WhatsApp já está conectado — não é necessário escanear o QR.'
        });
        return;
      }
      if (!isWaStatusAwaitingQr(st)) {
        await waSleep(1200);
        await fetchWaInfo({ silent: true, quiet: true });
      }
      setWaQrTick((v) => v + 1);
    } finally {
      setWaLoading(false);
    }
  }, [fetchWaInfo]);

  const refreshWaQrCode = useCallback(() => {
    setWaQrError(false);
    setWaQrTick((v) => v + 1);
  }, []);

  /**
   * Obtém o PNG do QR via API autenticada (JWT + x-academy-id). Retorna object URL ou null.
   * Quem consome deve revogar a URL anterior com URL.revokeObjectURL antes de substituir.
   * @param {string} instanceId
   * @returns {Promise<string | null>}
   */
  const fetchQrCode = useCallback(async (instanceId) => {
    const id = String(instanceId || '').trim();
    if (!id || !academyIdRef.current) return null;
    const maxAttempts = 5;
    try {
      const jwt = await getJwt();
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { blocked, res: resp } = await fetchWithBillingGuard(
          `/api/zapster/instances?action=qrcode&id=${encodeURIComponent(id)}&ts=${Date.now()}`,
          { headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') } }
        );
        if (blocked || !resp) return null;

        if (resp.ok) {
          const blob = await resp.blob();
          return URL.createObjectURL(blob);
        }

        const ct = String(resp.headers.get('content-type') || '');
        let errJson = null;
        if (ct.includes('application/json')) {
          try {
            errJson = await resp.json();
          } catch {
            void 0;
          }
        } else {
          try {
            await resp.text();
          } catch {
            void 0;
          }
        }

        if (resp.status === 404 && String(errJson?.error || '').trim() === 'instance_not_found') {
          setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null, phone: null });
          setWaQrShown(false);
          setWaQrError(false);
          setWaQrLoadFailedOnce(false);
          setWaQrTick(0);
          return null;
        }

        if (resp.status === 406) {
          await fetchWaInfo({ silent: true, quiet: true });
          const stAfter406 = String(waInfoRef.current?.status || '').trim().toLowerCase();
          if (stAfter406 === 'connected') {
            return null;
          }
          if (attempt < maxAttempts - 1) {
            await waSleep(2500);
            continue;
          }
          return null;
        }

        const msg = String(errJson?.detalhe || errJson?.erro || errJson?.codigo || '').trim();
        if (msg && resp.status !== 406) {
          useUiStore.getState().addToast({
            type: 'error',
            message: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg
          });
        }
        return null;
      }
      return null;
    } catch {
      return null;
    }
  }, [fetchWaInfo]);

  const recoverZapsterInstance = useCallback(async () => {
    if (!academyIdRef.current) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard('/api/zapster/instances?action=recover', {
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (blocked) return;
      const raw = await resp.text();
      const data = safeParseJson(raw) || {};
      if (!resp.ok) {
        if (isZapsterTokenMissingPayload(data)) setWaTokenMissing(true);
        throw new Error(normalizeApiError(raw, String(data.erro || '').trim() || 'Falha ao recuperar vínculo'));
      }
      if (data.recovered) {
        useUiStore.getState().addToast({ type: 'success', message: 'Dispositivo recuperado com sucesso!' });
        setWaPersistFailed(false);
        await fetchWaInfo({ silent: true });
        return;
      }
      if (data.already_linked) {
        setWaPersistFailed(false);
        await fetchWaInfo({ silent: true });
        useUiStore.getState().addToast({ type: 'success', message: 'Dispositivo já estava vinculado.' });
        return;
      }
      const errMsg = String(data.erro || '').trim();
      if (errMsg) {
        useUiStore.getState().addToast({ type: 'error', message: errMsg });
      } else {
        useUiStore.getState().addToast({ type: 'warning', message: 'Nenhuma conexão pendente encontrada para esta academia.' });
      }
    } catch (e) {
      useUiStore.getState().addToast({ type: 'error', message: e?.message || 'Erro ao recuperar' });
    } finally {
      setWaLoading(false);
    }
  }, [fetchWaInfo]);

  const disconnectWaInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
      });
      if (blocked) return;
      const raw = await resp.text();
      const delData = safeParseJson(raw) || {};
      if (!resp.ok) {
        if (isZapsterTokenMissingPayload(delData)) setWaTokenMissing(true);
        if (resp.status === 403) {
          useUiStore.getState().addToast({
            type: 'error',
            message: 'Esta conexão não pertence a esta academia.'
          });
          await fetchWaInfo({ silent: true });
          return;
        }
        throw new Error(normalizeApiError(raw, String(delData.erro || '').trim() || 'Falha ao desconectar'));
      }
      if (delData?.removido === false) {
        useUiStore.getState().addToast({
          type: 'error',
          message: 'Não foi possível desconectar. Tente novamente.'
        });
        return;
      }
      useUiStore.getState().addToast({ type: 'success', message: 'Dispositivo desconectado' });
      setWaPersistFailed(false);
      setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null, phone: null });
      setWaTokenMissing(false);
      setWaQrError(false);
      setWaQrTick(0);
      setWaQrShown(false);
      setWaQrLoadFailedOnce(false);
    } catch (e) {
      const msg = String(e?.message || '');
      if (
        msg.toLowerCase().includes('zapster_api_token') ||
        msg.toLowerCase().includes('zapster_token_missing') ||
        (msg.toLowerCase().includes('serviço de whatsapp') && msg.toLowerCase().includes('não configurado'))
      ) {
        setWaTokenMissing(true);
      }
      setConnectionError(msg || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo]);

  const powerOnInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?action=power-on&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });
      if (blocked) return;
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        const errData = safeParseJson(raw) || {};
        if (isZapsterTokenMissingPayload(errData)) setWaTokenMissing(true);
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao conectar o WhatsApp'));
      }
      setWaQrShown(true);
      setWaQrError(false);
      setWaQrLoadFailedOnce(false);
      await fetchWaInfo({ silent: true });
      const stAfter = String(waInfoRef.current?.status || '').trim().toLowerCase();
      if (stAfter === 'connected') {
        useUiStore.getState().addToast({ type: 'success', message: 'WhatsApp conectado' });
      } else {
        useUiStore.getState().addToast({
          type: 'success',
          message: 'Instância iniciada. Aguarde o QR aparecer abaixo ou use Reiniciar conexão.'
        });
      }
      await waSleep(3000);
      if (!hookMountedRef.current) return;
      await fetchWaInfo({ silent: true, quiet: true });
      if (!hookMountedRef.current) return;
      refreshWaQrCode();
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      if (hookMountedRef.current) setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo, refreshWaQrCode]);

  const powerOffInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?action=power-off&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });
      if (blocked) return;
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        const errData = safeParseJson(raw) || {};
        if (isZapsterTokenMissingPayload(errData)) setWaTokenMissing(true);
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao desconectar o WhatsApp'));
      }
      useUiStore.getState().addToast({ type: 'success', message: 'WhatsApp desconectado' });
      await fetchWaInfo({ silent: true });
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo]);

  const restartInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?action=restart&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id })
      });
      if (blocked) return;
      if (!(resp.ok || resp.status === 204)) {
        const raw = await resp.text();
        const errData = safeParseJson(raw) || {};
        if (isZapsterTokenMissingPayload(errData)) setWaTokenMissing(true);
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao reiniciar o WhatsApp'));
      }
      setWaQrShown(true);
      setWaQrError(false);
      setWaQrLoadFailedOnce(false);
      useUiStore.getState().addToast({ type: 'success', message: 'Reiniciando WhatsApp… aguarde o QR.' });
      const t1 = setTimeout(() => {
        if (!hookMountedRef.current) return;
        void fetchWaInfo({ silent: true, quiet: true });
      }, 1500);
      const t2 = setTimeout(() => {
        if (!hookMountedRef.current) return;
        refreshWaQrCode();
      }, 4000);
      deferredTimersRef.current.push(t1, t2);
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo, refreshWaQrCode]);

  /**
   * Sincroniza API reconcile (24h).
   * @param {((data: object) => void | Promise<void>)|undefined} afterSuccess — ex.: recarregar lista no Inbox
   */
  const reconcileWhatsAppHistory = useCallback(async (afterSuccess) => {
    const debugOn = inboxDebugEnabled();
    if (!academyIdRef.current) {
      const message = 'Não foi possível sincronizar: academia não identificada.';
      if (debugOn) {
        console.warn('[Inbox Reconcile] aborted: academyId vazio');
      }
      useUiStore.getState().addToast({ type: 'error', message });
      setConnectionError(message);
      return;
    }
    setConnectionError('');
    setWaSyncing(true);
    useUiStore.getState().addToast({ type: 'info', message: 'Sincronização iniciada…' });
    try {
      if (debugOn) {
        console.log('[Inbox Reconcile] start', { academyId: String(academyIdRef.current || '').trim() });
      }
      const jwt = await getJwt();
      const resp = await fetch('/api/whatsapp?action=reconcile', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          'x-academy-id': String(academyIdRef.current || ''),
          'content-type': 'application/json'
        },
        body: JSON.stringify({ hours: 23 })
      });
      const raw = await resp.text();
      const data = safeParseJson(raw) || {};
      if (debugOn) {
        console.log('[Inbox Reconcile] response', {
          ok: resp.ok,
          status: resp.status,
          keys: data && typeof data === 'object' ? Object.keys(data).slice(0, 12) : [],
        });
      }
      if (!resp.ok) {
        const retentionExceeded =
          data?.code === 'messages_retention_exceeded' ||
          resp.status === 402 ||
          String(data?.erro || data?.error || raw || '')
            .toLowerCase()
            .includes('messages_retention_exceeded') ||
          String(data?.erro || data?.error || raw || '').toLowerCase().includes('message history up to 24h');
        if (retentionExceeded) {
          useUiStore.getState().addToast({
            type: 'warning',
            message:
              String(data?.erro || '').trim() ||
              'Seu plano Zapster só permite importar mensagens das últimas 24h. Mensagens mais antigas não podem ser recuperadas por aqui — novas mensagens entram pelo webhook em tempo real.'
          });
          if (typeof afterSuccess === 'function') {
            try {
              await afterSuccess(data);
            } catch {
              void 0;
            }
          }
          return;
        }
        throw new Error(normalizeApiError(raw, 'Falha ao atualizar'));
      }
      const updated = Number.isFinite(Number(data?.conversations_updated)) ? Number(data.conversations_updated) : 0;
      const created = Number.isFinite(Number(data?.conversations_created)) ? Number(data.conversations_created) : 0;
      const merged = Number.isFinite(Number(data?.messages_merged)) ? Number(data.messages_merged) : 0;
      const zapsterItems = Number.isFinite(Number(data?.zapster_items)) ? Number(data.zapster_items) : 0;
      const phones = Number.isFinite(Number(data?.phones)) ? Number(data.phones) : 0;
      const pages = Number.isFinite(Number(data?.pages)) ? Number(data.pages) : 0;
      useUiStore.getState().addToast({
        type: updated > 0 || created > 0 || merged > 0 ? 'success' : 'warning',
        message:
          updated > 0 || created > 0 || merged > 0
            ? `Sincronizado • ${updated} conversas${created ? ` (+${created})` : ''}${merged ? ` • ${merged} msgs` : ''}`
            : `Sincronização sem novas conversas • Zapster: ${zapsterItems} itens • Telefones válidos: ${phones} • Páginas: ${pages}`
      });
      if (debugOn) {
        console.log('[Inbox Reconcile] success', { updated, created, merged, zapsterItems, phones, pages });
      }
      if (typeof afterSuccess === 'function') {
        try {
          await afterSuccess(data);
        } catch {
          void 0;
        }
      }
    } catch (e) {
      if (debugOn) {
        console.error('[Inbox Reconcile] error', e);
      }
      useUiStore.getState().addToast({ type: 'error', message: e?.message || 'Erro ao atualizar' });
    } finally {
      setWaSyncing(false);
    }
  }, []);

  useEffect(() => {
    if (!academyId) return;
    setWaQrShown(false);
    setWaQrLoadFailedOnce(false);
    setAcademyWaStatus('');
    void fetchWaInfo({ silent: true });
  }, [academyId, fetchWaInfo]);

  useEffect(() => {
    if (!options?.watchAcademyStatus && !options?.statusPollWhileMounted) return;
    if (!academyId || !DB_ID || !ACADEMIES_COL) return;

    let cancelled = false;
    let subscription = null;
    const channel = `databases.${DB_ID}.collections.${ACADEMIES_COL}.documents.${academyId}`;

    const onAcademyEvent = (ev) => {
      if (cancelled) return;
      const payload = ev && typeof ev === 'object' ? ev.payload : null;
      if (!payload || typeof payload !== 'object') return;
      const st = String(payload.zapster_status || '').trim();
      if (!st) return;
      setAcademyWaStatus(st);
      void fetchWaInfo({ silent: true, quiet: true });
    };

    void realtime
      .subscribe(channel, onAcademyEvent)
      .then((sub) => {
        if (cancelled) {
          void sub?.close?.();
          return;
        }
        subscription = sub;
      })
      .catch(() => {
        void 0;
      });

    return () => {
      cancelled = true;
      try {
        if (subscription && typeof subscription.close === 'function') void subscription.close();
      } catch {
        void 0;
      }
    };
  }, [academyId, options?.watchAcademyStatus, options?.statusPollWhileMounted, fetchWaInfo]);

  useEffect(() => {
    if (!options?.statusPollWhileMounted) return;
    if (!academyId) return;

    let stopped = false;
    let timer = null;

    const tick = () => {
      if (stopped || document.hidden) return;
      void fetchWaInfo({ silent: true, quiet: true });
    };

    const schedule = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, 60000);
    };

    const onVis = () => {
      if (document.hidden) {
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
        return;
      }
      void fetchWaInfo({ silent: true, quiet: true });
      schedule();
    };

    if (!document.hidden) {
      schedule();
    }
    document.addEventListener('visibilitychange', onVis);

    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVis);
      if (timer) clearInterval(timer);
    };
  }, [academyId, options?.statusPollWhileMounted, fetchWaInfo]);

  useEffect(() => {
    hookMountedRef.current = true;
    return () => {
      hookMountedRef.current = false;
      for (const t of deferredTimersRef.current) {
        clearTimeout(t);
      }
      deferredTimersRef.current = [];
    };
  }, []);

  const waStatus = useMemo(
    () => resolveWaStatus(academyWaStatus, waInfo?.status, waInfo?.instance_id),
    [academyWaStatus, waInfo?.status, waInfo?.instance_id]
  );

  const waConnected = waStatus === 'connected';

  const onQrImageError = useCallback(() => {
    setWaQrError(true);
    setWaQrLoadFailedOnce(true);
    void fetchWaInfo({ silent: true, quiet: true });
  }, [fetchWaInfo]);

  const onQrImageLoad = useCallback(() => {
    setWaQrError(false);
    void fetchWaInfo({ silent: true, quiet: true });
  }, [fetchWaInfo]);

  /** Enquanto o QR está na tela, consulta a API até refletir conexão (ou estados intermediários). */
  useEffect(() => {
    if (!waQrShown) return;
    const st = String(waStatus || '').trim().toLowerCase();
    if (st === 'connected') return;

    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      await fetchWaInfo({ silent: true, quiet: true });
    };

    void poll();
    const pollId = setInterval(poll, 3000);

    return () => {
      stopped = true;
      clearInterval(pollId);
    };
  }, [waQrShown, waStatus, fetchWaInfo]);

  return {
    waInfo,
    waStatus,
    waLoading,
    waTokenMissing,
    waQrError,
    waQrShown,
    waQrLoadFailedOnce,
    waQrTick,
    waSyncing,
    waPersistFailed,
    waConnected,
    isCreating,
    connectionError,
    fetchWaInfo,
    createWaInstance,
    disconnectWaInstance,
    recoverZapsterInstance,
    powerOnInstance,
    powerOffInstance,
    restartInstance,
    reconcileWhatsAppHistory,
    onQrImageError,
    onQrImageLoad,
    revealWaQrCode,
    refreshWaQrCode,
    fetchQrCode
  };
}
