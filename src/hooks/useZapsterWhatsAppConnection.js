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

/**
 * Estado e ações Zapster/WhatsApp compartilhadas entre Inbox (só leitura) e Agente IA (QR manual).
 * @param {string} academyId
 */
export function useZapsterWhatsAppConnection(academyId) {
  const academyIdRef = useRef('');
  const waPersistFailedRef = useRef(false);
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
        throw new Error(normalizeApiError(raw, String(data.erro || '').trim() || 'Falha ao consultar WhatsApp'));
      }
      const incomingId = data?.instance_id ?? null;
      const status = String(data?.status || '').trim() || 'unknown';
      const qrcode = data?.qrcode ?? null;
      setWaInfo((prev) => {
        if (incomingId) {
          if (prev.instance_id === incomingId && prev.status === status && prev.qrcode === qrcode) return prev;
          return { instance_id: incomingId, status, qrcode };
        }
        if (waPersistFailedRef.current && prev.instance_id) {
          if (prev.status === status && prev.qrcode === qrcode) return prev;
          return { ...prev, status, qrcode };
        }
        if (prev.instance_id === null && prev.status === status && prev.qrcode === qrcode) return prev;
        return { instance_id: null, status: 'disconnected', qrcode: null };
      });
      if (incomingId) {
        setWaPersistFailed(false);
      }
      setWaTokenMissing(false);
      if (status === 'connected') {
        setWaQrError(false);
        setWaQrShown(false);
        setWaQrLoadFailedOnce(false);
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
  }, []);

  const createWaInstance = useCallback(async () => {
    if (!academyIdRef.current) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
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
  }, []);

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
        throw new Error(normalizeApiError(raw, String(delData.erro || '').trim() || 'Falha ao desconectar'));
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
  }, [waInfo?.instance_id]);

  const powerOnInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?action=power-on&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
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
    } catch (e) {
      setConnectionError(String(e?.message || '') || 'Erro');
    } finally {
      setWaLoading(false);
    }
  }, [waInfo?.instance_id, fetchWaInfo]);

  const powerOffInstance = useCallback(async () => {
    const id = String(waInfo?.instance_id || '').trim();
    if (!id) return;
    setConnectionError('');
    setWaLoading(true);
    try {
      const jwt = await getJwt();
      const { blocked, res: resp } = await fetchWithBillingGuard(`/api/zapster/instances?action=power-off&id=${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
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
        headers: { Authorization: `Bearer ${jwt}`, 'x-academy-id': String(academyIdRef.current || '') }
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
    if (!academyIdRef.current) return;
    setConnectionError('');
    setWaSyncing(true);
    try {
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
      useUiStore.getState().addToast({
        type: 'success',
        message: `Sincronizado • ${updated} conversas${created ? ` (+${created})` : ''}${merged ? ` • ${merged} msgs` : ''}`
      });
      if (typeof afterSuccess === 'function') {
        try {
          await afterSuccess(data);
        } catch {
          void 0;
        }
      }
    } catch (e) {
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
    refreshWaQrCode
  };
}
