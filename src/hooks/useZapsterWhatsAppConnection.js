import { useCallback, useEffect, useRef, useState } from 'react';
import { account } from '../lib/appwrite';
import { fetchWithBillingGuard } from '../lib/billingBlockedFetch';
import { useUiStore } from '../store/useUiStore';

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
    if (typeof parsed.erro === 'string' && parsed.erro.trim()) return parsed.erro.trim();
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  }
  return s;
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
 * @param {{ onRegisterWebhooksResult?: (r: { ok: boolean }) => void }} [options]
 */
export function useZapsterWhatsAppConnection(academyId, options = {}) {
  const academyIdRef = useRef('');
  const onRegisterWebhooksResultRef = useRef(options?.onRegisterWebhooksResult);
  const waPersistFailedRef = useRef(false);

  useEffect(() => {
    onRegisterWebhooksResultRef.current = options?.onRegisterWebhooksResult;
  }, [options?.onRegisterWebhooksResult]);
  const [waLoading, setWaLoading] = useState(false);
  const [waInfo, setWaInfo] = useState({ instance_id: null, status: 'disconnected', qrcode: null });
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

  useEffect(() => {
    academyIdRef.current = String(academyId || '').trim();
  }, [academyId]);

  useEffect(() => {
    waPersistFailedRef.current = waPersistFailed;
  }, [waPersistFailed]);

  /** Instância órfã (Zapster sem o id): limpa UI sem toast nem connectionError. */
  const resetWaToNoInstanceSilently = useCallback(() => {
    setWaPersistFailed(false);
    setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null });
    setWaTokenMissing(false);
    setWaQrError(false);
    setWaQrShown(false);
    setWaQrLoadFailedOnce(false);
    setWaQrTick(0);
    setConnectionError('');
  }, []);

  const registerWebhooks = useCallback(async (instanceId) => {
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
        cb?.({ ok: true });
        return;
      }

      cb?.({ ok: false });
    } catch {
      onRegisterWebhooksResultRef.current?.({ ok: false });
    }
  }, []);

  const fetchWaInfo = useCallback(async ({ silent = false, quiet = false } = {}) => {
    if (!academyIdRef.current) return;
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
          if (prev.instance_id === incomingId && prev.status === finalStatus && prev.qrcode === finalQrcode) return prev;
          return { instance_id: incomingId, status: finalStatus, qrcode: finalQrcode };
        }
        if (waPersistFailedRef.current && prev.instance_id) {
          if (prev.status === finalStatus && prev.qrcode === finalQrcode) return prev;
          return { ...prev, status: finalStatus, qrcode: finalQrcode };
        }
        if (prev.instance_id === null && prev.status === finalStatus && prev.qrcode === finalQrcode) return prev;
        return { instance_id: null, status: 'disconnected', qrcode: null };
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

      if (incomingId && String(finalStatus || '').trim().toLowerCase() === 'connected') {
        void registerWebhooks(incomingId);
      }
    } catch (e) {
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
      if (!quiet) setWaLoading(false);
    }
  }, [resetWaToNoInstanceSilently, registerWebhooks]);

  const createWaInstance = useCallback(async () => {
    if (!academyIdRef.current) return;
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
            message: recoverData.recovered ? 'Instância existente recuperada com sucesso!' : 'Instância já estava vinculada.'
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
        body: JSON.stringify({})
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
      setWaInfo({ instance_id, status, qrcode });
      if (data.persist_failed) {
        setWaPersistFailed(true);
        useUiStore.getState().addToast({
          type: 'warning',
          message: String(data.aviso || 'Instância criada na Zapster, mas falhou salvar na base. Use Verificar e corrigir.')
        });
      } else {
        setWaPersistFailed(false);
        useUiStore.getState().addToast({ type: 'success', message: 'Instância criada' });
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
      setWaLoading(false);
    }
  }, [fetchWaInfo]);

  const revealWaQrCode = useCallback(() => {
    if (!academyIdRef.current) return;
    setWaQrShown(true);
    setWaQrError(false);
    setWaQrTick((v) => v + 1);
    void fetchWaInfo({ silent: true, quiet: true });
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
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(
        `/api/zapster/instances?action=qrcode&id=${encodeURIComponent(id)}&ts=${Date.now()}`,
        { headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') } }
      );
      if (blocked || !resp || !resp.ok) {
        if (resp && !resp.ok) {
          const ct = String(resp.headers.get('content-type') || '');
          if (ct.includes('application/json')) {
            try {
              const j = await resp.json();
              if (resp.status === 404 && String(j?.error || '').trim() === 'instance_not_found') {
                setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null });
                setWaQrShown(false);
                setWaQrError(false);
                setWaQrLoadFailedOnce(false);
                setWaQrTick(0);
                return null;
              }
              const msg = String(j?.detalhe || j?.erro || j?.codigo || '').trim();
              if (msg) {
                useUiStore.getState().addToast({
                  type: 'error',
                  message: msg.length > 220 ? `${msg.slice(0, 220)}…` : msg
                });
              }
            } catch {
              void 0;
            }
          }
        }
        return null;
      }
      const blob = await resp.blob();
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }, []);

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
        useUiStore.getState().addToast({ type: 'warning', message: 'Nenhuma instância órfã encontrada para esta academia.' });
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
            message: 'Esta instância não pertence a esta academia.'
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
      setWaInfo({ instance_id: null, status: 'disconnected', qrcode: null });
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
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao ligar instância'));
      }
      useUiStore.getState().addToast({ type: 'success', message: 'Instância ligada' });
      await fetchWaInfo({ silent: true });
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const qrUrl = await fetchQrCode(id);
        if (qrUrl) URL.revokeObjectURL(qrUrl);
      } catch {
        void 0;
      }
      refreshWaQrCode();
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo, fetchQrCode, refreshWaQrCode]);

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
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao desligar instância'));
      }
      useUiStore.getState().addToast({ type: 'success', message: 'Instância desligada' });
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
        throw new Error(normalizeApiError(raw, String(errData.erro || '').trim() || 'Falha ao reiniciar instância'));
      }
      useUiStore.getState().addToast({ type: 'success', message: 'Reiniciando instância…' });
      setTimeout(() => {
        fetchWaInfo({ silent: true });
      }, 1200);
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo]);

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
        body: JSON.stringify({})
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
        if (data?.code === 'messages_retention_exceeded' || resp.status === 402) {
          useUiStore.getState().addToast({
            type: 'warning',
            message: 'Plano Zapster limita o histórico a 24h. As mensagens recentes foram importadas normalmente.'
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
    fetchWaInfo({ silent: true });
  }, [academyId, fetchWaInfo]);

  const waConnected = String(waInfo?.status || '').trim() === 'connected';

  const onQrImageError = useCallback(() => {
    setWaQrError(true);
    setWaQrLoadFailedOnce(true);
  }, []);

  const onQrImageLoad = useCallback(() => {
    setWaQrError(false);
  }, []);

  useEffect(() => {
    if (!waQrShown) return;
    const isScanning = ['qrcode', 'scanning', 'open'].includes(String(waInfo?.status || '').toLowerCase());
    if (!isScanning) return;

    let stopped = false;
    const pollId = setInterval(async () => {
      if (stopped) return;
      await fetchWaInfo({ silent: true, quiet: true });
    }, 15000);

    return () => {
      stopped = true;
      clearInterval(pollId);
    };
  }, [waInfo?.status, waQrShown, fetchWaInfo]);

  return {
    waInfo,
    waLoading,
    waTokenMissing,
    waQrError,
    waQrShown,
    waQrLoadFailedOnce,
    waQrTick,
    waSyncing,
    waPersistFailed,
    waConnected,
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
